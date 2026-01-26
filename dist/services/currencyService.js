"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrencyService = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
class CurrencyService {
    constructor(repository) {
        this.repository = repository;
    }
    async upsertRate(base, quote, rate, updatedAt) {
        const existing = await this.repository.findOne({ where: { base, quote } });
        if (existing) {
            existing.rate = rate;
            if (updatedAt)
                existing.updatedAt = updatedAt;
            return this.repository.save(existing);
        }
        const record = this.repository.create({ base, quote, rate, ...(updatedAt ? { updatedAt } : {}) });
        return this.repository.save(record);
    }
    async getLatestRate(base, quote) {
        return this.repository.findOne({ where: { base, quote }, order: { updatedAt: "DESC" } });
    }
    async getLatestAndPrevious(base, quote) {
        const rows = await this.repository.find({ where: { base, quote }, order: { updatedAt: "DESC" }, take: 2 });
        const [latest, previous] = rows;
        return { latest: latest ?? null, previous: previous ?? null };
    }
    async getRateValue(base, quote) {
        if (base === quote)
            return 1;
        const direct = await this.getLatestRate(base, quote);
        if (direct)
            return Number(direct.rate);
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
    async convertAmount(amount, base, quote) {
        const rate = await this.getRateValue(base, quote);
        if (rate === null)
            return null;
        return amount * rate;
    }
    async pullLatestRates(apiUrl, quote = "UZS") {
        const response = await (0, node_fetch_1.default)(apiUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch rates from API (${response.status} ${response.statusText})`);
        }
        const payload = (await response.json());
        const saved = [];
        for (const item of payload) {
            const cleanName = decodeHtml(item.name);
            const match = cleanName.match(/^(\d+)\s+(.+)$/);
            const amount = match ? Number(match[1]) : 1;
            const labelRaw = match ? match[2] : cleanName;
            const label = labelRaw.replace(/\s+/g, " ").trim();
            const base = mapNameToCode(label);
            if (!base) {
                console.warn(`Unknown currency label skipped: ${label}`);
                continue;
            }
            const numeric = Number(item.kurs.replace(/\s/g, ""));
            if (!Number.isFinite(numeric) || amount <= 0) {
                console.warn(`Invalid rate skipped for ${label} (${item.kurs})`);
                continue;
            }
            const ratePerUnit = numeric / amount;
            const stored = await this.upsertRate(base, quote, ratePerUnit.toFixed(6));
            saved.push(stored);
        }
        return saved;
    }
    async pullCbuRates(apiUrl = "https://cbu.uz/uz/arkhiv-kursov-valyut/json/") {
        const response = await (0, node_fetch_1.default)(apiUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch rates from CBU (${response.status} ${response.statusText})`);
        }
        const payload = (await response.json());
        const saved = [];
        for (const item of payload) {
            const base = item.Ccy?.toUpperCase();
            if (!base)
                continue;
            const nominal = item.Nominal ? Number(item.Nominal.replace(/\s/g, "")) : 1;
            const rateNumber = Number(item.Rate.replace(/\s/g, ""));
            if (!Number.isFinite(rateNumber) || nominal <= 0)
                continue;
            const perUnit = rateNumber / nominal;
            const date = parseCbuDate(item.Date);
            const stored = await this.upsertRate(base, "UZS", perUnit.toFixed(6), date ?? undefined);
            saved.push(stored);
        }
        return saved;
    }
    async listAllRates() {
        return this.repository.find({ order: { base: "ASC" } });
    }
}
exports.CurrencyService = CurrencyService;
const NAME_TO_CODE = {
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
const mapNameToCode = (label) => {
    const normalized = label.replace(/\s+/g, " ").trim();
    const code = NAME_TO_CODE[normalized];
    return code;
};
const decodeHtml = (value) => value
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
const parseCbuDate = (value) => {
    const match = value?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match)
        return null;
    const [, dd, mm, yyyy] = match;
    const iso = `${yyyy}-${mm}-${dd}T00:00:00Z`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
};
//# sourceMappingURL=currencyService.js.map