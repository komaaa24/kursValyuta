export declare const env: {
    botToken: string;
    db: {
        host: string;
        port: number;
        username: string;
        password: string;
        database: string;
    };
    sherlarDb: {
        host: string;
        port: number;
        username: string;
        password: string;
        database: string;
    };
    rateApiUrl: string;
    proPaymentUrl: string;
    proBanksUrl: string;
    proPrice: number;
    proDurationDays: number;
    click: {
        serviceId: string | undefined;
        merchantId: string | undefined;
        secretKey: string | undefined;
        returnUrl: string | undefined;
        returnUrlAllowlist: string[];
        ipAllowlist: string[];
        baseUrl: string;
        enabled: boolean;
    };
    appBaseUrl: string | undefined;
    paymentTtlMinutes: number;
    legacyWebhookToken: string | undefined;
    paymentLinkMode: string;
    adminIds: number[];
    webhookPort: number;
    alertCheckIntervalMs: number;
    rateSyncIntervalMs: number;
};
//# sourceMappingURL=env.d.ts.map