export declare enum PaymentStatus {
    PENDING = "pending",
    PAID = "paid",
    FAILED = "failed"
}
export declare class Payment {
    id: number;
    transactionParam: string;
    telegramId: number;
    amount: number;
    status: PaymentStatus;
    appliedAt?: Date;
    expiresAt?: Date | null;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=Payment.d.ts.map