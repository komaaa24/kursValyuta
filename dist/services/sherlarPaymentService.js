"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SherlarPaymentService = void 0;
const sherlar_data_source_1 = require("../database/sherlar-data-source");
class SherlarPaymentService {
    constructor() {
        this.connecting = null;
    }
    async ensureConnected() {
        if (sherlar_data_source_1.sherlarDataSource.isInitialized)
            return true;
        if (this.connecting)
            return this.connecting;
        this.connecting = sherlar_data_source_1.sherlarDataSource
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
    async hasValidPayment(telegramId, amount, minPaidAt) {
        if (!Number.isFinite(telegramId) || telegramId <= 0) {
            return { ok: true, hasPaid: false };
        }
        const connected = await this.ensureConnected();
        if (!connected) {
            return { ok: false, error: "Sherlar database connection failed" };
        }
        try {
            const params = [telegramId, amount];
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
            const rows = (await sherlar_data_source_1.sherlarDataSource.query(query, params));
            if (rows && rows.length > 0) {
                const payment = rows[0];
                const paymentDate = payment.created_at ? new Date(payment.created_at) : undefined;
                console.log("[SHERLAR_DB] payment found", { userId: telegramId, amount, paymentId: payment.id, paymentDate });
                return { ok: true, hasPaid: true, paymentDate, payment };
            }
            console.log("[SHERLAR_DB] no payment found", { userId: telegramId, amount });
            return { ok: true, hasPaid: false };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("[SHERLAR_DB] payment check failed", message);
            return { ok: false, error: message };
        }
    }
}
exports.SherlarPaymentService = SherlarPaymentService;
//# sourceMappingURL=sherlarPaymentService.js.map