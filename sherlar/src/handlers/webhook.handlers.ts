import { Request, Response } from "express";
import { Bot } from "grammy";
import { Payment, PaymentStatus } from "../entities/Payment.js";
import { AppDataSource } from "../database/data-source.js";
import { UserService } from "../services/user.service.js";
import { normalizeBotUsername } from "../utils/bot-scope.js";

const userService = new UserService();

export interface WebhookBotResolver {
    fallbackBot?: Bot | null;
    getBotByUsername?: (botUsername: string) => Bot | null | undefined;
}

/**
 * 💰 Click to'lov webhook handler
 * To'lov amalga oshgach avtomatik tasdiqlanadi
 */
export async function handlePaymentWebhook(req: Request, res: Response, bots: WebhookBotResolver) {
    const { tx, status, amount, user_id } = req.body;
    const webhookBotUsername = normalizeBotUsername(req.body.bot_username ?? req.body.botUsername);

    console.log("📥 [WEBHOOK] Click payment notification:", {
        tx,
        status,
        amount,
        user_id,
        botUsername: webhookBotUsername,
        fullBody: req.body
    });

    if (!tx) {
        return res.status(400).json({
            error: "transaction_param required"
        });
    }

    const paymentRepo = AppDataSource.getRepository(Payment);

    const payment = await paymentRepo.findOne({
        where: { transactionParam: tx },
        relations: ["user"]
    });

    if (!payment) {
        console.warn("⚠️ [WEBHOOK] Payment not found for tx:", tx);
        return res.status(404).json({
            error: "Payment not found"
        });
    }

    const paymentBotUsername = normalizeBotUsername(payment.botUsername);
    const telegramId = Number(payment.user?.telegramId ?? payment.metadata?.telegramId);
    const webhookUserId = Number(user_id);

    if (Number.isFinite(webhookUserId) && webhookUserId > 0 && webhookUserId !== telegramId) {
        console.warn("⚠️ [WEBHOOK] user_id mismatch", {
            tx,
            expected: telegramId,
            received: webhookUserId,
        });
        return res.status(400).json({
            error: "user_id mismatch",
        });
    }

    if (req.body.bot_username || req.body.botUsername) {
        const receivedBotUsername = normalizeBotUsername(req.body.bot_username ?? req.body.botUsername);
        if (receivedBotUsername !== paymentBotUsername) {
            console.warn("⚠️ [WEBHOOK] botUsername mismatch", {
                tx,
                expected: paymentBotUsername,
                received: receivedBotUsername,
            });
            return res.status(400).json({
                error: "botUsername mismatch",
            });
        }
    }

    if (payment.status === PaymentStatus.PAID) {
        console.log("ℹ️ [WEBHOOK] Payment already completed for tx:", tx);
        return res.json({
            success: true,
            message: "Already paid"
        });
    }

    const paymentSuccess = status === "success" || status === "paid" || status === "completed";

    if (!paymentSuccess) {
        payment.status = PaymentStatus.FAILED;
        payment.metadata = {
            ...payment.metadata,
            botUsername: paymentBotUsername,
            failedAt: new Date().toISOString(),
            failedReason: status
        };
        await paymentRepo.save(payment);

        console.log(`❌ [WEBHOOK] Payment failed: ${status}`);

        return res.json({
            success: false,
            message: "Payment failed"
        });
    }

    payment.status = PaymentStatus.PAID;
    payment.botUsername = paymentBotUsername;
    payment.metadata = {
        ...payment.metadata,
        botUsername: paymentBotUsername,
        paidAt: new Date().toISOString(),
        webhookAmount: amount,
        webhookUserId: Number.isFinite(webhookUserId) ? webhookUserId : user_id,
        webhookBotUsername,
    };
    await paymentRepo.save(payment);

    if (Number.isFinite(telegramId) && telegramId > 0) {
        await userService.markAsPaid(telegramId, paymentBotUsername);

        console.log(`✅ [WEBHOOK] User ${telegramId} marked as paid in bot ${paymentBotUsername}`);

        const bot = bots.getBotByUsername?.(paymentBotUsername) ?? bots.fallbackBot ?? null;
        if (bot) {
            try {
                await bot.api.sendMessage(
                    telegramId,
                    `✅ <b>To'lovingiz tasdiqlandi!</b>\n\n` +
                    `💰 Summa: ${payment.amount} so'm\n` +
                    `🎉 Endi botdan cheksiz foydalanishingiz mumkin!\n\n` +
                    `She'rlarni o'qishni boshlash uchun /start tugmasini bosing.`,
                    { parse_mode: "HTML" }
                );
                console.log(`📤 [WEBHOOK] Notification sent to user ${telegramId} via @${paymentBotUsername}`);
            } catch (error) {
                console.error("❌ [WEBHOOK] Failed to send notification:", error);
            }
        } else {
            console.warn(`⚠️ [WEBHOOK] Bot not found for notification: @${paymentBotUsername}`);
        }
    }

    console.log("✅ [WEBHOOK] Payment completed successfully");

    return res.json({
        success: true,
        message: "Payment completed"
    });
}
