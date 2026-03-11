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
export declare const generateClickPaymentLink: (params: ClickPaymentLinkParams) => ClickPaymentLink;
export declare const generateTransactionParam: () => string;
export declare const verifyClickSignature: (clickTransId: string, serviceId: string, secretKey: string, merchantTransId: string, amount: string, action: string, signTime: string, receivedSignString: string, merchantPrepareId?: string) => boolean;
export declare const generateClickResponseSignature: (clickTransId: string, serviceId: string, secretKey: string, merchantTransId: string, merchantPrepareId: string, amount: string, action: string, signTime: string) => string;
export declare const normalizeReturnUrl: (value: string) => string | null;
export declare const normalizeReturnUrlList: (values: string[]) => string[];
export declare const isReturnUrlAllowed: (candidate: string, allowlist: string[]) => boolean;
//# sourceMappingURL=clickService.d.ts.map