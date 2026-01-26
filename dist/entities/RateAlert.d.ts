export type AlertDirection = "above" | "below";
export declare class RateAlert {
    id: number;
    telegramId: number;
    base: string;
    quote: string;
    targetRate: string;
    direction: AlertDirection;
    isActive: boolean;
    triggeredAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=RateAlert.d.ts.map