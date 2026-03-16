import fetch from "node-fetch";
import { Repository } from "typeorm";
import { CurrencyRate } from "../entities/CurrencyRate";

const DEFAULT_CBU_RATES_URL = "https://cbu.uz/uz/arkhiv-kursov-valyut/json/";

export class CurrencyService {
  constructor(private readonly repository: Repository<CurrencyRate>) {}

  async upsertRate(base: string, quote: string, rate: string, sourceDate?: Date): Promise<CurrencyRate> {
    const existing = await this.repository.findOne({ where: { base, quote } });
    if (existing) {
      existing.rate = rate;
      existing.sourceDate = sourceDate ?? null;
      return this.repository.save(existing);
    }

    const record = this.repository.create({ base, quote, rate, sourceDate: sourceDate ?? null });
    return this.repository.save(record);
  }

  async getLatestRate(base: string, quote: string): Promise<CurrencyRate | null> {
    return this.repository.findOne({ where: { base, quote }, order: { updatedAt: "DESC" } });
  }

  async getLatestAndPrevious(base: string, quote: string): Promise<{ latest: CurrencyRate | null; previous: CurrencyRate | null }> {
    const rows = await this.repository.find({ where: { base, quote }, order: { updatedAt: "DESC" }, take: 2 });
    const [latest, previous] = rows;
    return { latest: latest ?? null, previous: previous ?? null };
  }

  async getRateValue(base: string, quote: string): Promise<number | null> {
    if (base === quote) return 1;

    const direct = await this.getLatestRate(base, quote);
    if (direct) return Number(direct.rate);

    // If base is UZS and we have quote ➝ UZS, invert
    if (base === "UZS") {
      const inverse = await this.getLatestRate(quote, "UZS");
      if (inverse && Number(inverse.rate) !== 0) {
        return 1 / Number(inverse.rate);
      }
    }

    // Try full inverse for any pair
    const inverse = await this.getLatestRate(quote, base);
    if (inverse && Number(inverse.rate) !== 0) {
      return 1 / Number(inverse.rate);
    }

    return null;
  }

  async convertAmount(amount: number, base: string, quote: string): Promise<number | null> {
    const rate = await this.getRateValue(base, quote);
    if (rate === null) return null;
    return amount * rate;
  }

  async syncRates(primaryApiUrl?: string): Promise<CurrencyRate[]> {
    const candidates = Array.from(new Set([DEFAULT_CBU_RATES_URL, primaryApiUrl].filter((value): value is string => Boolean(value?.trim()))));
    const errors: Error[] = [];

    for (const apiUrl of candidates) {
      try {
        return await this.pullLatestRates(apiUrl);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    throw errors[0] ?? new Error("No rate source configured");
  }

  async pullLatestRates(apiUrl: string, quote: string = "UZS"): Promise<CurrencyRate[]> {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch rates from API (${response.status} ${response.statusText})`);
    }

    const payload = (await response.json()) as unknown;
    const saved: CurrencyRate[] = [];

    if (Array.isArray(payload)) {
      const cbuSaved = await this.saveCbuPayload(payload);
      if (cbuSaved.length > 0) return cbuSaved;

      const legacySaved = await this.saveLegacyPayload(payload, quote);
      if (legacySaved.length > 0) return legacySaved;
    }

    // New endpoint: { buy: [{ rate }], sell: [{ rate }] } (usually USD/UZS bank rates)
    const usdRate = extractUsdRateFromBankPayload(payload);
    if (usdRate !== null) {
      const stored = await this.upsertRate("USD", quote, usdRate.toFixed(6));
      saved.push(stored);
      return saved;
    }

    throw new Error("Unsupported rate API payload format");
  }

  async pullCbuRates(apiUrl = DEFAULT_CBU_RATES_URL): Promise<CurrencyRate[]> {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch rates from CBU (${response.status} ${response.statusText})`);
    }

    const payload = (await response.json()) as { Ccy: string; Rate: string; Date: string; Nominal?: string }[];
    return this.saveCbuPayload(payload);
  }

  async listAllRates(): Promise<CurrencyRate[]> {
    return this.repository.find({ order: { base: "ASC" } });
  }

  private async saveLegacyPayload(payload: unknown[], quote: string): Promise<CurrencyRate[]> {
    const saved: CurrencyRate[] = [];

    for (const item of payload) {
      if (!item || typeof item !== "object") continue;
      if (!("name" in item) || !("kurs" in item)) continue;

      const rawName = (item as { name?: unknown }).name;
      const rawKurs = (item as { kurs?: unknown }).kurs;
      if (typeof rawName !== "string") continue;

      const cleanName = decodeHtml(rawName);
      const match = cleanName.match(/^(\d+)\s+(.+)$/);
      const amount = match ? Number(match[1]) : 1;
      const labelRaw = match ? match[2] : cleanName;
      const label = labelRaw.replace(/\s+/g, " ").trim();

      const base = mapNameToCode(label);
      if (!base) {
        console.warn(`Unknown currency label skipped: ${label}`);
        continue;
      }

      const numeric = parseRateNumber(rawKurs);
      if (!Number.isFinite(numeric) || amount <= 0) {
        console.warn(`Invalid rate skipped for ${label} (${String(rawKurs)})`);
        continue;
      }

      const ratePerUnit = numeric / amount;
      const stored = await this.upsertRate(base, quote, ratePerUnit.toFixed(6));
      saved.push(stored);
    }

    return saved;
  }

  private async saveCbuPayload(payload: unknown): Promise<CurrencyRate[]> {
    if (!Array.isArray(payload)) return [];

    const saved: CurrencyRate[] = [];

    for (const item of payload) {
      if (!item || typeof item !== "object") continue;
      const cbuItem = item as { Ccy?: unknown; Rate?: unknown; Date?: unknown; Nominal?: unknown };
      if (typeof cbuItem.Ccy !== "string" || typeof cbuItem.Rate !== "string") continue;

      const base = cbuItem.Ccy.toUpperCase();
      if (!base) continue;

      const nominalValue = typeof cbuItem.Nominal === "string" ? cbuItem.Nominal : "1";
      const nominal = Number(nominalValue.replace(/\s/g, ""));
      const rateNumber = Number(cbuItem.Rate.replace(/\s/g, ""));
      if (!Number.isFinite(rateNumber) || nominal <= 0) continue;

      const perUnit = rateNumber / nominal;
      const sourceDate = typeof cbuItem.Date === "string" ? parseCbuDate(cbuItem.Date) : null;
      const stored = await this.upsertRate(base, "UZS", perUnit.toFixed(6), sourceDate ?? undefined);
      saved.push(stored);
    }

    return saved;
  }
}

const NAME_TO_CODE: Record<string, string> = {
  "AQSH dollari": "USD",
  EVRO: "EUR",
  "Rossiya rubli": "RUB",
  "Angliya funt sterlingi": "GBP",
  "Yaponiya iyenasi": "JPY",
  "Qatar riali": "QAR",
  "Qirg‘iz somi": "KGS",
  "Yangi Zelandiya dollari": "NZD",
  "Yaman riali": "YER",
  "Eron riali": "IRR",
  "Shvetsiya kronasi": "SEK",
  "Shveytsariya franki": "CHF",
  "Chexiya kronasi": "CZK",
  "Xitoy yuani": "CNY",
  "Filippin pesosi": "PHP",
  "Urugvay pesosi": "UYU",
  "Ummon riali": "OMR",
  "Ukraina grivnasi": "UAH",
  "Turkmaniston manati": "TMT",
  "Turkiya lirasi": "TRY",
  "Tunis dinori": "TND",
  "Tojikiston somonisi": "TJS",
  "Tailand bati": "THB",
  "Suriya funti": "SYP",
  "Sudan funti": "SDG",
  "Singapur dollari": "SGD",
  "Serbiya dinori": "RSD",
  SDR: "XDR",
  "Saudiya Arabistoni riali": "SAR",
  "Ruminiya leyi": "RON",
  "Quvayt dinori": "KWD",
  "Polsha zlotiysi": "PLN",
  "Pokiston rupiyasi": "PKR",
  "Ozarbayjon manati": "AZN",
  "Norvegiya kronasi": "NOK",
  "Myanma kyati": "MMK",
  "Mongoliya tugriki": "MNT",
  "Moldaviya leyi": "MDL",
  "Misr funti": "EGP",
  "Meksika pesosi": "MXN",
  "Marokash dirhami": "MAD",
  "Malayziya ringgiti": "MYR",
  "Liviya dinori": "LYD",
  "Livan funti": "LBP",
  "Laos kipisi": "LAK",
  "Kuba pesosi": "CUP",
  "Koreya Respublikasi voni": "KRW",
  "Kanada dollari": "CAD",
  "Kambodja riyeli": "KHR",
  "Isroil shekeli": "ILS",
  "Islandiya kronasi": "ISK",
  "Iroq dinori": "IQD",
  "Iordaniya dinori": "JOD",
  "Indoneziya rupiyasi": "IDR",
  "Janubiy Afrika randi": "ZAR",
  "Jazoir dinori": "DZD",
  "Daniya kronasi": "DKK",
  "Gruziya larisi": "GEL",
  "Vetnam dongi": "VND",
  "Venesuela bolivari": "VES",
  "Vengriya forinti": "HUF",
  "Bruney dollari": "BND",
  "Braziliya reali": "BRL",
  "Bolgariya levi": "BGN",
  "Belorus rubli": "BYN",
  "Bahrayn dinori": "BHD",
  "Bangladesh takasi": "BDT",
  "BAA dirhami": "AED",
  "Afg‘oniston afg‘onisi": "AFN",
  "Armaniston drami": "AMD",
  "Argentina pesosi": "ARS",
  "Qozog‘iston tengesi": "KZT",
  "Avstraliya dollari": "AUD",
  "Hindiston rupiyasi": "INR",
  "Gongkong dollari": "HKD",
};

const mapNameToCode = (label: string): string | undefined => {
  const normalized = label.replace(/\s+/g, " ").trim();
  const code = NAME_TO_CODE[normalized];
  return code;
};

const decodeHtml = (value: string): string =>
  value
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

const parseRateNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  const cleaned = value
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  return Number(cleaned);
};

const extractUsdRateFromBankPayload = (payload: unknown): number | null => {
  if (!payload || typeof payload !== "object") return null;

  const bag = payload as { buy?: unknown; sell?: unknown };
  const buyRates = parseBankSideRates(bag.buy);
  const sellRates = parseBankSideRates(bag.sell);

  if (buyRates.length && sellRates.length) {
    const bestBuy = Math.max(...buyRates);
    const bestSell = Math.min(...sellRates);
    return (bestBuy + bestSell) / 2;
  }

  const allRates = [...buyRates, ...sellRates];
  if (!allRates.length) return null;
  const sum = allRates.reduce((acc, current) => acc + current, 0);
  return sum / allRates.length;
};

const parseBankSideRates = (entries: unknown): number[] => {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((item) => {
      if (!item || typeof item !== "object") return Number.NaN;
      const raw = (item as { rate?: unknown; rate_text?: unknown }).rate ?? (item as { rate_text?: unknown }).rate_text;
      return parseRateNumber(raw);
    })
    .filter((value) => Number.isFinite(value));
};

const parseCbuDate = (value: string): Date | null => {
  const match = value?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const iso = `${yyyy}-${mm}-${dd}T00:00:00Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};
