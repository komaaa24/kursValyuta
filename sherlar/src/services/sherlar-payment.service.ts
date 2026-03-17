import { SherlarDataSource } from "../database/sherlar-data-source.js";

/**
 * Sherlar database service - to'lovlarni tekshirish
 * 
 * Jadval strukturasi:
 * - id: integer
 * - user_id: integer (Telegram ID)
 * - amount: numeric
 * - click_merchant_trans_id: varchar
 * - click_payment_id: bigint
 * - status: varchar
 * - created_at: timestamp
 * - updated_at: timestamp
 */
export class SherlarPaymentService {
    /**
     * Tashqi DB'da aynan shu tranzaksiya bo'yicha muvaffaqiyatli to'lovni topish.
     */
    async findPaidPaymentByTransaction(
        telegramId: number,
        transactionParam: string,
    ): Promise<{
        hasPaid: boolean;
        paymentDate?: Date;
        payment?: {
            id: number;
            user_id: number;
            amount: number;
            status: string;
            created_at: Date;
            updated_at?: Date;
            click_payment_id?: string | number | null;
            click_merchant_trans_id?: string | null;
        };
    }> {
        try {
            if (!SherlarDataSource.isInitialized) {
                await SherlarDataSource.initialize();
                console.log("✅ Sherlar database connected");
            }

            const query = `
                SELECT 
                    id, 
                    user_id, 
                    amount, 
                    status, 
                    created_at,
                    updated_at,
                    click_payment_id,
                    click_merchant_trans_id
                FROM payments
                WHERE user_id = $1
                  AND click_merchant_trans_id = $2
                  AND amount = 1111
                  AND UPPER(status) = 'PAID'
                ORDER BY created_at DESC
                LIMIT 1
            `;

            const result = await SherlarDataSource.query(query, [telegramId, transactionParam]);

            if (result && result.length > 0) {
                const payment = result[0];
                console.log("✅ Payment found in sherlar DB:", {
                    payment_id: payment.id,
                    user_id: payment.user_id,
                    amount: payment.amount,
                    status: payment.status,
                    created_at: payment.created_at,
                    click_merchant_trans_id: payment.click_merchant_trans_id,
                });
                return {
                    hasPaid: true,
                    paymentDate: new Date(payment.created_at),
                    payment,
                };
            }

            console.log(`ℹ️ No payment found for user_id=${telegramId}, tx=${transactionParam} in sherlar DB`);
            return { hasPaid: false };
        } catch (error) {
            console.error("❌ Error checking sherlar payment:", error);
            if (error instanceof Error) {
                console.error("Error details:", error.message);
            }
            return { hasPaid: false };
        }
    }

    /**
     * Barcha to'lovlarni olish (admin uchun)
     * @param limit - Nechta to'lov olish
     */
    async getAllPayments(limit: number = 50): Promise<any[]> {
        try {
            if (!SherlarDataSource.isInitialized) {
                await SherlarDataSource.initialize();
            }

            const query = `
                SELECT 
                    id, 
                    user_id, 
                    amount, 
                    status, 
                    created_at,
                    click_payment_id
                FROM payments
                WHERE amount = 1111
                  AND UPPER(status) = 'PAID'
                ORDER BY created_at DESC
                LIMIT $1
            `;

            const result = await SherlarDataSource.query(query, [limit]);
            return result || [];

        } catch (error) {
            console.error("❌ Error getting all payments:", error);
            return [];
        }
    }
}
