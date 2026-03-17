import "reflect-metadata";
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import bodyParser from "body-parser";
import { Bot } from "grammy";
import { AppDataSource } from "./database/data-source.js";
import {
    handleStart,
    handleShowPoems,
    handleNext,
    handlePayment,
    handleCheckPayment,
    syncPoemsFromAPI
} from "./handlers/bot.handlers.js";
import { handlePaymentWebhook } from "./handlers/webhook.handlers.js";
import { normalizeBotUsername } from "./utils/bot-scope.js";

function required(name: string): string {
    const v = (process.env[name] || "").trim();
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

function parseBotsEnv(): Array<{ key: string; token: string }> {
    const raw = (process.env.BOTS || "").trim();
    if (!raw) {
        return [{ key: "default", token: required("BOT_TOKEN") }];
    }

    // Format: key1:token1,key2:token2
    return raw
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((pair) => {
            const idx = pair.indexOf(":");
            if (idx === -1) throw new Error(`Invalid BOTS entry: ${pair} (expected key:token)`);
            const key = pair.slice(0, idx).trim();
            const token = pair.slice(idx + 1).trim();
            if (!key || !token) throw new Error(`Invalid BOTS entry: ${pair}`);
            return { key, token };
        });
}

async function wireBot(bot: Bot) {
    bot.catch((err) => console.error("❌ Bot error:", err));

    bot.command("start", handleStart);
    bot.command("sync", async (ctx) => {
        const userId = ctx.from?.id;
        const adminIds = (process.env.ADMIN_IDS || "").split(",").map(Number);

        if (!userId || !adminIds.includes(userId)) {
            return ctx.reply("⛔️ Bu buyruqdan foydalanish uchun ruxsatingiz yo'q.");
        }

        await ctx.reply("🔄 Sinxronlashtirilmoqda...");
        await syncPoemsFromAPI();
        await ctx.reply("✅ Sinxronlash muvaffaqiyatli tugadi!");
    });

    bot.on("callback_query:data", async (ctx) => {
        const data = ctx.callbackQuery.data;

        try {
            if (data === "show_poems") {
                await handleShowPoems(ctx);
            } else if (data === "back_to_start") {
                await handleStart(ctx);
            } else if (data.startsWith("next:")) {
                const index = parseInt(data.replace("next:", ""), 10);
                await handleNext(ctx, index);
            } else if (data === "payment") {
                await handlePayment(ctx);
            } else if (data.startsWith("check_payment:")) {
                const paymentId = parseInt(data.replace("check_payment:", ""), 10);
                await handleCheckPayment(ctx, paymentId);
            } else if (data === "cancel_payment") {
                await ctx.editMessageText("❌ To'lov bekor qilindi.\n\nQayta urinish uchun /start buyrug'ini bering.");
                await ctx.answerCallbackQuery();
            } else {
                await ctx.answerCallbackQuery();
            }
        } catch (error) {
            console.error("Callback query error:", error);
            await ctx.answerCallbackQuery({
                text: "❌ Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.",
                show_alert: true
            });
        }
    });
}

async function main() {
    const PORT = Number(process.env.WEBHOOK_PORT ?? process.env.PORT) || 8989;

    console.log("🚀 Starting Multi-Bot + Payment Gateway...");

    console.log("📦 Connecting to database...");
    await AppDataSource.initialize();
    console.log("✅ Database connected");

    const botsEnv = parseBotsEnv();
    const botsByKey: Record<string, Bot> = {};
    const botsByUsername = new Map<string, Bot>();

    for (const { key, token } of botsEnv) {
        const bot = new Bot(token);
        await wireBot(bot);
        await bot.init();
        botsByKey[key] = bot;
        botsByUsername.set(normalizeBotUsername(bot.botInfo.username), bot);
    }

    const defaultBotKey = (process.env.DEFAULT_BOT_KEY || "").trim() || botsEnv[0]?.key;
    const defaultBot = botsByKey[defaultBotKey];

    const app = express();
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    app.get("/health", (req, res) => {
        res.json({ status: "ok", timestamp: new Date().toISOString(), uptime: process.uptime() });
    });

    // Payment webhook endpoints (single port for all bots)
    app.post("/webhook/pay", async (req, res) => {
        try {
            await handlePaymentWebhook(req, res, {
                fallbackBot: defaultBot,
                getBotByUsername: (botUsername) => botsByUsername.get(normalizeBotUsername(botUsername)),
            });
        } catch (error) {
            console.error("Webhook error:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    });

    app.post("/api/pay", async (req, res) => {
        try {
            await handlePaymentWebhook(req, res, {
                fallbackBot: defaultBot,
                getBotByUsername: (botUsername) => botsByUsername.get(normalizeBotUsername(botUsername)),
            });
        } catch (error) {
            console.error("Webhook error:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    });

    app.post("/internal/send-payment-notification", async (req, res) => {
        try {
            const { telegramId, amount, botUsername } = req.body;

            if (!telegramId || !botUsername) {
                return res.status(400).json({ error: "telegramId and botUsername required" });
            }

            const bot = botsByUsername.get(normalizeBotUsername(botUsername));
            if (!bot) {
                return res.status(404).json({ error: "Bot not found" });
            }

            const { InlineKeyboard } = await import("grammy");
            const keyboard = new InlineKeyboard()
                .url("🔙 Botga qaytish", `https://t.me/${bot.botInfo.username}`);

            await bot.api.sendMessage(
                telegramId,
                `✅ <b>To'lovingiz tasdiqlandi!</b>\n\n` +
                `💰 Summa: ${amount || 1111} so'm\n` +
                `🎉 Endi botdan cheksiz foydalanishingiz mumkin!\n\n` +
                `She'rlarni o'qishni boshlash uchun quyidagi tugmani bosing 👇`,
                {
                    parse_mode: "HTML",
                    reply_markup: keyboard
                }
            );

            return res.json({ success: true });
        } catch (error) {
            console.error("Internal notification error:", error);
            return res.status(500).json({ error: "Failed to send notification" });
        }
    });

    app.listen(PORT, () => console.log(`🌐 Gateway server running on port ${PORT}`));

    for (const [key, bot] of Object.entries(botsByKey)) {
        void bot.start({
            onStart: (botInfo) => console.log(`✅ Bot[${key}] @${botInfo.username} started`)
        });
    }

    const autoSync = (process.env.AUTO_SYNC_ON_STARTUP || "true").toLowerCase() !== "false";
    if (autoSync) {
        console.log("🔄 Background sync started...");
        void syncPoemsFromAPI();
    }
}

main().catch((err) => {
    console.error("❌ Fatal:", err);
    process.exit(1);
});
