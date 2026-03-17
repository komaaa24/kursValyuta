import "reflect-metadata";
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import { Repository } from "typeorm";
import { AppDataSource } from "./database/data-source.js";
import { SherlarDataSource } from "./database/sherlar-data-source.js";
import { Payment, PaymentStatus } from "./entities/Payment.js";
import { User } from "./entities/User.js";
import { UserService } from "./services/user.service.js";
import { generatePaymentLink, generateTransactionParam, getFixedPaymentAmount } from "./services/click.service.js";
import { extractBotUsernameFromReturnUrl, normalizeBotUsername } from "./utils/bot-scope.js";

function resolveBotUsername(rawBotUsername?: string, rawBotKey?: string, returnUrl?: string): string {
    const explicitBotUsername = String(rawBotUsername || "").trim();
    if (explicitBotUsername) {
        return normalizeBotUsername(explicitBotUsername);
    }

    const botUsernameFromReturnUrl = extractBotUsernameFromReturnUrl(returnUrl);
    if (botUsernameFromReturnUrl) {
        return botUsernameFromReturnUrl;
    }

    const legacyBotKey = String(rawBotKey || "").trim();
    if (legacyBotKey) {
        return normalizeBotUsername(legacyBotKey);
    }

    return normalizeBotUsername(process.env.DEFAULT_BOT_USERNAME);
}

async function findOrCreateScopedUser(
    userRepo: Repository<User>,
    telegramId: number,
    botUsername: string,
    userData: {
        username?: string;
        firstName?: string;
        lastName?: string;
    },
): Promise<User> {
    let user = await userRepo.findOne({
        where: { telegramId, botUsername },
    });

    if (!user) {
        user = userRepo.create({
            telegramId,
            botUsername,
            username: userData.username,
            firstName: userData.firstName,
            lastName: userData.lastName,
        });
        await userRepo.save(user);
        return user;
    }

    user.username = userData.username || user.username;
    user.firstName = userData.firstName || user.firstName;
    user.lastName = userData.lastName || user.lastName;
    await userRepo.save(user);
    return user;
}

async function upsertExternalPayment(tx: string, telegramId: number) {
    const query = `
        INSERT INTO payments (user_id, amount, status, created_at, updated_at, click_merchant_trans_id)
        VALUES ($1, $2, $3, NOW(), NOW(), $4)
        ON CONFLICT (click_merchant_trans_id) 
        DO UPDATE SET 
            status = EXCLUDED.status,
            updated_at = NOW()
        RETURNING id, user_id, amount, status
    `;

    return SherlarDataSource.query(query, [
        telegramId,
        getFixedPaymentAmount(),
        "PAID",
        tx,
    ]);
}

async function processIncomingPayment(
    tx: string,
    status: string,
    rawUserId: unknown,
    userService: UserService,
): Promise<void> {
    const paymentRepo = AppDataSource.getRepository(Payment);
    const payment = await paymentRepo.findOne({
        where: { transactionParam: tx },
        relations: ["user"],
    });

    if (!payment) {
        console.warn(`⚠️ [GATEWAY] Payment not found for tx=${tx}`);
        return;
    }

    const telegramId = Number(payment.user?.telegramId ?? payment.metadata?.telegramId ?? rawUserId);
    const webhookUserId = Number(rawUserId);
    const botUsername = normalizeBotUsername(payment.botUsername);
    const paymentSuccess = status === "success" || status === "paid" || status === "completed";

    if (Number.isFinite(webhookUserId) && webhookUserId > 0 && webhookUserId !== telegramId) {
        throw new Error(`user_id mismatch for tx=${tx}: expected ${telegramId}, received ${webhookUserId}`);
    }

    if (!paymentSuccess) {
        payment.status = PaymentStatus.FAILED;
        payment.metadata = {
            ...payment.metadata,
            botUsername,
            failedAt: new Date().toISOString(),
            failedReason: status,
        };
        await paymentRepo.save(payment);
        return;
    }

    payment.status = PaymentStatus.PAID;
    payment.botUsername = botUsername;
    payment.metadata = {
        ...payment.metadata,
        botUsername,
        paidAt: new Date().toISOString(),
        webhookUserId: Number.isFinite(webhookUserId) ? webhookUserId : rawUserId,
    };
    await paymentRepo.save(payment);

    if (!Number.isFinite(telegramId) || telegramId <= 0) {
        console.warn(`⚠️ [GATEWAY] Missing telegramId for tx=${tx}`);
        return;
    }

    await userService.markAsPaid(telegramId, botUsername);
    console.log(`✅ [GATEWAY] User ${telegramId} marked as paid for @${botUsername}`);

    const internalNotifyUrl = (process.env.INTERNAL_PAYMENT_NOTIFY_URL || "http://localhost:9988/internal/send-payment-notification").trim();
    if (!internalNotifyUrl) {
        return;
    }

    try {
        await axios.post(
            internalNotifyUrl,
            {
                telegramId,
                amount: payment.amount,
                botUsername,
            },
            { timeout: 5000 },
        );
        console.log(`📤 [GATEWAY] Notification request forwarded for user ${telegramId} via @${botUsername}`);
    } catch (notifError) {
        console.error("❌ [GATEWAY] Failed to forward notification:", notifError instanceof Error ? notifError.message : notifError);
    }
}

async function main() {
    const PORT = 9999; // Fixed port for payment gateway
    const userService = new UserService();

    console.log("🚀 Starting Payment Gateway...");
    console.log("📦 Connecting to main database...");
    await AppDataSource.initialize();
    console.log("✅ Main database connected");

    console.log("📦 Connecting to sherlar database...");
    await SherlarDataSource.initialize();
    console.log("✅ Sherlar database connected");

    const app = express();
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    app.get("/health", (req, res) => {
        res.json({ status: "ok", timestamp: new Date().toISOString(), uptime: process.uptime() });
    });

    // Universal payment link generator (Click) for all bots
    // Example: /payme_url.php?user_id=7789445876&amount=5000&bot_username=latifalar_bot
    app.get("/payme_url.php", async (req, res) => {
        try {
            const apiKey = (process.env.PAYMENT_API_KEY || "").trim();
            if (apiKey) {
                const provided = String(req.query.key || req.headers["x-api-key"] || "").trim();
                if (provided !== apiKey) return res.status(401).send("unauthorized");
            }

            const rawUserId = String(req.query.user_id || "").trim();
            const botKey = String(req.query.bot_key || "").trim();
            const returnUrlFromRequest = String(req.query.return_url || "").trim() || undefined;
            const botUsername = resolveBotUsername(
                String(req.query.bot_username || "").trim(),
                botKey,
                returnUrlFromRequest,
            );
            const format = String(req.query.format || "json").trim().toLowerCase();
            const suppliedTransactionParam = String(req.query.tx || "").trim();

            const telegramId = Number(rawUserId);
            if (!Number.isFinite(telegramId) || telegramId <= 0) return res.status(400).send("invalid user_id");

            const amount = getFixedPaymentAmount();
            const userRepo = AppDataSource.getRepository(User);
            const user = await findOrCreateScopedUser(userRepo, telegramId, botUsername, {
                username: String(req.query.username || "") || undefined,
                firstName: String(req.query.first_name || "") || undefined,
                lastName: String(req.query.last_name || "") || undefined,
            });

            const paymentRepo = AppDataSource.getRepository(Payment);
            const transactionParam = suppliedTransactionParam || generateTransactionParam();
            let payment = await paymentRepo.findOne({
                where: { transactionParam },
                relations: ["user"],
            });

            if (payment) {
                if (payment.user?.telegramId !== telegramId || normalizeBotUsername(payment.botUsername) !== botUsername) {
                    return res.status(409).send("payment scope mismatch");
                }
            } else {
                payment = paymentRepo.create({
                    transactionParam,
                    userId: user.id,
                    botUsername,
                    amount,
                    status: PaymentStatus.PENDING,
                    metadata: {
                        telegramId,
                        botUsername,
                        botKey,
                        source: "gateway",
                    },
                });
                await paymentRepo.save(payment);
            }

            const returnUrl = returnUrlFromRequest || `https://t.me/${botUsername}`;
            const paymentLink = generatePaymentLink({
                amount,
                transactionParam,
                userId: telegramId,
                botUsername,
                returnUrl,
            });

            if (format === "text" || format === "url") {
                return res.type("text/plain").send(paymentLink.url);
            }

            return res.json({
                ok: true,
                url: paymentLink.url,
                payment_id: payment.id,
                transaction_param: transactionParam,
                return_url: returnUrl,
                bot_username: botUsername,
            });
        } catch (error) {
            console.error("payme_url.php error:", error);
            return res.status(500).send("internal error");
        }
    });

    const handleGatewayWebhook = async (req: express.Request, res: express.Response) => {
        try {
            const { tx, status, user_id } = req.body;

            console.log("📥 [GATEWAY] Payment webhook:", { tx, status, user_id });

            if (!tx) {
                return res.status(400).json({ error: "transaction_param required" });
            }

            if (status === "success" || status === "paid" || status === "completed") {
                const telegramId = Number(user_id);
                if (Number.isFinite(telegramId) && telegramId > 0) {
                    try {
                        const result = await upsertExternalPayment(tx, telegramId);
                        console.log("✅ [GATEWAY] Payment saved to sherlar DB:", result[0]);
                    } catch (dbError) {
                        console.error("❌ [GATEWAY] Failed to save to sherlar DB:", dbError);
                    }
                }
            }

            await processIncomingPayment(tx, status, user_id, userService);

            return res.json({ success: true, message: "Payment processed" });
        } catch (error) {
            console.error("Webhook error:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    };

    app.post("/webhook/pay", handleGatewayWebhook);
    app.post("/api/pay", handleGatewayWebhook);

    app.listen(PORT, () => console.log(`🌐 Payment Gateway running on port ${PORT}`));
}

main().catch((err) => {
    console.error("❌ Fatal:", err);
    process.exit(1);
});
