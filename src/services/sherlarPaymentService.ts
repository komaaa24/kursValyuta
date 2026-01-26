import { sherlarDataSource } from "../database/sherlar-data-source";

type SherlarPaymentRow = {
  id?: number;
  user_id?: number;
  amount?: number;
  status?: string;
  created_at?: string | Date;
  click_payment_id?: number | string | null;
  click_merchant_trans_id?: string | null;
};

export type SherlarPaymentCheckResult =
  | { ok: true; hasPaid: boolean; paymentDate?: Date; payment?: SherlarPaymentRow }
  | { ok: false; error: string };

export class SherlarPaymentService {
  private connecting: Promise<boolean> | null = null;

  private async ensureConnected(): Promise<boolean> {
    if (sherlarDataSource.isInitialized) return true;
    if (this.connecting) return this.connecting;

    this.connecting = sherlarDataSource
      .initialize()
      .then(() => {
        console.log("[SHERLAR_DB] connected");
        return true;
      })
      .catch((error) => {
        console.error("[SHERLAR_DB] connection failed", error);
        return false;
      })
      .finally(() => {
        this.connecting = null;
      });

    return this.connecting;
  }

  async hasValidPayment(telegramId: number, amount: number, minPaidAt?: Date | null): Promise<SherlarPaymentCheckResult> {
    if (!Number.isFinite(telegramId) || telegramId <= 0) {
      return { ok: true, hasPaid: false };
    }

    const connected = await this.ensureConnected();
    if (!connected) {
      return { ok: false, error: "Sherlar database connection failed" };
    }

    try {
      const params: Array<number | string> = [telegramId, amount];
      const cutoffClause = minPaidAt ? "AND created_at > $3" : "";
      if (minPaidAt) {
        params.push(minPaidAt.toISOString());
      }

      const query = `
        SELECT
          id,
          user_id,
          amount,
          status,
          created_at,
          click_payment_id,
          click_merchant_trans_id
        FROM payments
        WHERE user_id = $1
          AND amount = $2
          AND UPPER(status) = 'PAID'
          ${cutoffClause}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const rows = (await sherlarDataSource.query(query, params)) as SherlarPaymentRow[];

      if (rows && rows.length > 0) {
        const payment = rows[0];
        const paymentDate = payment.created_at ? new Date(payment.created_at) : undefined;
        console.log("[SHERLAR_DB] payment found", { userId: telegramId, amount, paymentId: payment.id, paymentDate });
        return { ok: true, hasPaid: true, paymentDate, payment };
      }

      console.log("[SHERLAR_DB] no payment found", { userId: telegramId, amount });
      return { ok: true, hasPaid: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[SHERLAR_DB] payment check failed", message);
      return { ok: false, error: message };
    }
  }
}
