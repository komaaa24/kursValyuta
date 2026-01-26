type SherlarPaymentRow = {
    id?: number;
    user_id?: number;
    amount?: number;
    status?: string;
    created_at?: string | Date;
    click_payment_id?: number | string | null;
    click_merchant_trans_id?: string | null;
};
export type SherlarPaymentCheckResult = {
    ok: true;
    hasPaid: boolean;
    paymentDate?: Date;
    payment?: SherlarPaymentRow;
} | {
    ok: false;
    error: string;
};
export declare class SherlarPaymentService {
    private connecting;
    private ensureConnected;
    hasValidPayment(telegramId: number, amount: number, minPaidAt?: Date | null): Promise<SherlarPaymentCheckResult>;
}
export {};
//# sourceMappingURL=sherlarPaymentService.d.ts.map