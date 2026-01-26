import dotenv from "dotenv";

dotenv.config();

type RequiredKey =
  | "BOT_TOKEN"
  | "DB_HOST"
  | "DB_PORT"
  | "DB_USERNAME"
  | "DB_PASSWORD"
  | "DB_NAME";

const requireEnv = (key: RequiredKey): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

const numberEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const optionalEnv = (key: string): string | undefined => {
  const value = process.env[key];
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseNumberList = (value: string | undefined): number[] => {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
};

const clickServiceId = optionalEnv("CLICK_SERVICE_ID");
const clickMerchantId = optionalEnv("CLICK_MERCHANT_ID");
const clickSecretKey = optionalEnv("CLICK_SECRET_KEY");

const dbHost = requireEnv("DB_HOST");
const dbPort = Number(requireEnv("DB_PORT"));
const dbUsername = requireEnv("DB_USERNAME");
const dbPassword = requireEnv("DB_PASSWORD");
const dbName = requireEnv("DB_NAME");

const sherlarDbHost = process.env.SHERLAR_DB_HOST ?? dbHost;
const sherlarDbPort = numberEnv(process.env.SHERLAR_DB_PORT ?? String(dbPort), dbPort);
const sherlarDbUsername = process.env.SHERLAR_DB_USERNAME ?? process.env.SHERLAR_DB_USER ?? dbUsername;
const sherlarDbPassword = process.env.SHERLAR_DB_PASSWORD ?? process.env.SHERLAR_DB_PASS ?? dbPassword;
const sherlarDbName = process.env.SHERLAR_DB_NAME ?? "sherlar";

export const env = {
  botToken: requireEnv("BOT_TOKEN"),
  db: {
    host: dbHost,
    port: dbPort,
    username: dbUsername,
    password: dbPassword,
    database: dbName,
  },
  sherlarDb: {
    host: sherlarDbHost,
    port: sherlarDbPort,
    username: sherlarDbUsername,
    password: sherlarDbPassword,
    database: sherlarDbName,
  },
  rateApiUrl: process.env.RATE_API_URL ?? "http://94.158.51.173:8080/kurs/kurs.php",
  proPaymentUrl: process.env.PRO_PAYMENT_URL ?? "http://94.158.52.192/kurs/test.php",
  proBanksUrl: process.env.PRO_BANKS_URL ?? "http://94.158.52.192/kurs/test.php",
  proPrice: Number(process.env.PRO_PRICE ?? 1111),
  proDurationDays: numberEnv(process.env.PRO_DURATION_DAYS ?? "30", 30),
  click: {
    serviceId: clickServiceId,
    merchantId: clickMerchantId,
    secretKey: clickSecretKey,
    returnUrl: optionalEnv("CLICK_RETURN_URL"),
    baseUrl: optionalEnv("CLICK_BASE_URL") ?? "https://my.click.uz/services/pay",
    enabled: Boolean(clickServiceId && clickMerchantId && clickSecretKey),
  },
  adminIds: parseNumberList(process.env.ADMIN_IDS ?? process.env.OPERATOR_CHAT_ID),
  webhookPort: numberEnv(process.env.WEBHOOK_PORT ?? process.env.PORT ?? "3000", 3000),
  alertCheckIntervalMs: numberEnv(process.env.ALERT_CHECK_INTERVAL_MS ?? "300000", 300000),
};
