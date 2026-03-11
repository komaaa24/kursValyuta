import crypto from "crypto";

export type ClickPaymentLinkParams = {
  baseUrl?: string;
  serviceId: string;
  merchantId: string;
  amount: number;
  transactionParam: string;
  returnUrl: string;
};

export type ClickPaymentLink = {
  url: string;
  transactionParam: string;
};

export const generateClickPaymentLink = (params: ClickPaymentLinkParams): ClickPaymentLink => {
  const baseUrl = params.baseUrl ?? "https://my.click.uz/services/pay";
  const url = `${baseUrl}?service_id=${params.serviceId}&merchant_id=${params.merchantId}&amount=${params.amount}&transaction_param=${params.transactionParam}&return_url=${params.returnUrl}`;
  return { url, transactionParam: params.transactionParam };
};

export const generateTransactionParam = (): string => crypto.randomUUID().replace(/-/g, "");

export const verifyClickSignature = (
  clickTransId: string,
  serviceId: string,
  secretKey: string,
  merchantTransId: string,
  amount: string,
  action: string,
  signTime: string,
  receivedSignString: string,
  merchantPrepareId?: string,
): boolean => {
  let signString = "";
  if (action === "0") {
    signString = md5(clickTransId + serviceId + secretKey + merchantTransId + amount + action + signTime);
  } else {
    signString = md5(clickTransId + serviceId + secretKey + merchantTransId + (merchantPrepareId ?? "") + amount + action + signTime);
  }
  return signString === receivedSignString;
};

export const generateClickResponseSignature = (
  clickTransId: string,
  serviceId: string,
  secretKey: string,
  merchantTransId: string,
  merchantPrepareId: string,
  amount: string,
  action: string,
  signTime: string,
): string => md5(clickTransId + serviceId + secretKey + merchantTransId + merchantPrepareId + amount + action + signTime);

export const normalizeReturnUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    const normalizedPath = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${normalizedPath}`;
  } catch {
    return null;
  }
};

export const normalizeReturnUrlList = (values: string[]): string[] => {
  const normalized = new Set<string>();
  for (const value of values) {
    const next = normalizeReturnUrl(value);
    if (next) normalized.add(next);
  }
  return Array.from(normalized);
};

export const isReturnUrlAllowed = (candidate: string, allowlist: string[]): boolean => {
  const normalizedCandidate = normalizeReturnUrl(candidate);
  if (!normalizedCandidate) return false;
  return allowlist.includes(normalizedCandidate);
};

const md5 = (text: string): string => crypto.createHash("md5").update(text).digest("hex");
