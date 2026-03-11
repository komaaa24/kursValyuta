"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const requireEnv = (key) => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required env var: ${key}`);
    }
    return value;
};
const numberEnv = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const optionalEnv = (key) => {
    const value = process.env[key];
    if (!value)
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};
const parseNumberList = (value) => {
    if (!value)
        return [];
    return value
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item));
};
const parseList = (value) => {
    if (!value)
        return [];
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
};
const clickServiceId = optionalEnv("CLICK_SERVICE_ID");
const clickMerchantId = optionalEnv("CLICK_MERCHANT_ID");
const clickSecretKey = optionalEnv("CLICK_SECRET_KEY");
const clickReturnUrl = optionalEnv("CLICK_RETURN_URL");
const clickReturnUrlAllowlist = Array.from(new Set([...parseList(process.env.CLICK_RETURN_URL_WHITELIST), ...(clickReturnUrl ? [clickReturnUrl] : [])]));
const clickIpAllowlist = parseList(process.env.CLICK_IP_ALLOWLIST);
const appBaseUrl = optionalEnv("APP_BASE_URL");
const paymentTtlMinutes = numberEnv(process.env.PAYMENT_TTL_MINUTES ?? "20", 20);
const paymentLinkModeRaw = optionalEnv("PAYMENT_LINK_MODE")?.toLowerCase();
const legacyWebhookToken = optionalEnv("LEGACY_WEBHOOK_TOKEN") ?? optionalEnv("PAYMENT_WEBHOOK_TOKEN");
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
exports.env = {
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
    rateApiUrl: process.env.RATE_API_URL ?? "http://94.158.52.192/kurs/test.php",
    proPaymentUrl: process.env.PRO_PAYMENT_URL ?? "http://94.158.52.192/kurs/test.php",
    proBanksUrl: process.env.PRO_BANKS_URL ?? "http://94.158.52.192/kurs/test.php",
    proPrice: Number(process.env.PRO_PRICE ?? 1111),
    proDurationDays: numberEnv(process.env.PRO_DURATION_DAYS ?? "30", 30),
    click: {
        serviceId: clickServiceId,
        merchantId: clickMerchantId,
        secretKey: clickSecretKey,
        returnUrl: clickReturnUrl,
        returnUrlAllowlist: clickReturnUrlAllowlist,
        ipAllowlist: clickIpAllowlist,
        baseUrl: optionalEnv("CLICK_BASE_URL") ?? "https://my.click.uz/services/pay",
        enabled: Boolean(clickServiceId && clickMerchantId && clickSecretKey),
    },
    appBaseUrl,
    paymentTtlMinutes,
    legacyWebhookToken,
    paymentLinkMode: paymentLinkModeRaw === "legacy"
        ? "legacy"
        : paymentLinkModeRaw === "tx-only"
            ? "tx-only"
            : appBaseUrl && clickServiceId && clickMerchantId && clickSecretKey
                ? "tx-only"
                : "legacy",
    adminIds: parseNumberList(process.env.ADMIN_IDS ?? process.env.OPERATOR_CHAT_ID),
    webhookPort: numberEnv(process.env.WEBHOOK_PORT ?? process.env.PORT ?? "3000", 3000),
    alertCheckIntervalMs: numberEnv(process.env.ALERT_CHECK_INTERVAL_MS ?? "300000", 300000),
};
//# sourceMappingURL=env.js.map