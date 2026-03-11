"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isReturnUrlAllowed = exports.normalizeReturnUrlList = exports.normalizeReturnUrl = exports.generateClickResponseSignature = exports.verifyClickSignature = exports.generateTransactionParam = exports.generateClickPaymentLink = void 0;
const crypto_1 = __importDefault(require("crypto"));
const generateClickPaymentLink = (params) => {
    const baseUrl = params.baseUrl ?? "https://my.click.uz/services/pay";
    const url = `${baseUrl}?service_id=${params.serviceId}&merchant_id=${params.merchantId}&amount=${params.amount}&transaction_param=${params.transactionParam}&return_url=${params.returnUrl}`;
    return { url, transactionParam: params.transactionParam };
};
exports.generateClickPaymentLink = generateClickPaymentLink;
const generateTransactionParam = () => crypto_1.default.randomUUID().replace(/-/g, "");
exports.generateTransactionParam = generateTransactionParam;
const verifyClickSignature = (clickTransId, serviceId, secretKey, merchantTransId, amount, action, signTime, receivedSignString, merchantPrepareId) => {
    let signString = "";
    if (action === "0") {
        signString = md5(clickTransId + serviceId + secretKey + merchantTransId + amount + action + signTime);
    }
    else {
        signString = md5(clickTransId + serviceId + secretKey + merchantTransId + (merchantPrepareId ?? "") + amount + action + signTime);
    }
    return signString === receivedSignString;
};
exports.verifyClickSignature = verifyClickSignature;
const generateClickResponseSignature = (clickTransId, serviceId, secretKey, merchantTransId, merchantPrepareId, amount, action, signTime) => md5(clickTransId + serviceId + secretKey + merchantTransId + merchantPrepareId + amount + action + signTime);
exports.generateClickResponseSignature = generateClickResponseSignature;
const normalizeReturnUrl = (value) => {
    try {
        const url = new URL(value);
        url.hash = "";
        url.search = "";
        const normalizedPath = url.pathname.replace(/\/+$/, "");
        return `${url.origin}${normalizedPath}`;
    }
    catch {
        return null;
    }
};
exports.normalizeReturnUrl = normalizeReturnUrl;
const normalizeReturnUrlList = (values) => {
    const normalized = new Set();
    for (const value of values) {
        const next = (0, exports.normalizeReturnUrl)(value);
        if (next)
            normalized.add(next);
    }
    return Array.from(normalized);
};
exports.normalizeReturnUrlList = normalizeReturnUrlList;
const isReturnUrlAllowed = (candidate, allowlist) => {
    const normalizedCandidate = (0, exports.normalizeReturnUrl)(candidate);
    if (!normalizedCandidate)
        return false;
    return allowlist.includes(normalizedCandidate);
};
exports.isReturnUrlAllowed = isReturnUrlAllowed;
const md5 = (text) => crypto_1.default.createHash("md5").update(text).digest("hex");
//# sourceMappingURL=clickService.js.map