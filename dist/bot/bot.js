"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBot = void 0;
const grammy_1 = require("grammy");
const node_fetch_1 = __importDefault(require("node-fetch"));
const env_1 = require("../config/env");
const Payment_1 = require("../entities/Payment");
const proService_1 = require("../services/proService");
const sherlarPaymentService_1 = require("../services/sherlarPaymentService");
const clickService_1 = require("../services/clickService");
const formatHelp = () => [
    "💱 Valyuta olamiga xush kelibsiz!",
    "▫️ Konvertatsiya: USD ↔️ UZS yo'nalishini tanlang, miqdorni kiriting va natijani bir zumda oling.",
    "▫️ Kurslar: mashhur valyutalar bo'yicha eng so'nggi kurslarni ko'ring.",
    "▫️ Kursni kuzatish: PRO rejimda USD/EUR va boshqa valyutalarga narx alert qo'ying.",
    "▫️ Hammasi qulay tugmalar orqali ishlaydi. Qo'llanma uchun \"Yordam\" ni bosing.",
].join("\n");
const homeKeyboard = () => new grammy_1.InlineKeyboard()
    .text("💱 Konvertatsiya", "menu:open:convert")
    .text("📊 Kurslar", "menu:open:rates")
    .row()
    .text("⭐ Pro", "menu:open:pro")
    .text("ℹ️ Yordam", "menu:open:help");
const convertPairKeyboard = () => new grammy_1.InlineKeyboard()
    .text("USD → UZS", "convert:pair:USD_UZS")
    .text("EUR → UZS", "convert:pair:EUR_UZS")
    .row()
    .text("RUB → UZS", "convert:pair:RUB_UZS")
    .text("CNY → UZS", "convert:pair:CNY_UZS")
    .row()
    .text("UZS → USD", "convert:pair:UZS_USD")
    .text("UZS → EUR", "convert:pair:UZS_EUR")
    .row()
    .text("UZS → RUB", "convert:pair:UZS_RUB")
    .text("UZS → CNY", "convert:pair:UZS_CNY")
    .row()
    .text("⬅️ Orqaga", "menu:open:home");
const ratesKeyboard = () => new grammy_1.InlineKeyboard()
    .text("⬅️ Orqaga", "menu:open:home");
const alertsKeyboard = () => new grammy_1.InlineKeyboard()
    .text("USD", "alert:create:USD")
    .text("EUR", "alert:create:EUR")
    .row()
    .text("RUB", "alert:create:RUB")
    .text("GBP", "alert:create:GBP")
    .row()
    .text("⬅️ Orqaga", "menu:open:home");
const helpKeyboard = () => new grammy_1.InlineKeyboard()
    .text("Bot qanday ishlaydi", "help:topic:how")
    .row()
    .text("Kurslar qayerdan", "help:topic:source")
    .row()
    .text("⬅️ Orqaga", "menu:open:home");
const commandKeyboard = new grammy_1.Keyboard()
    .text("💱 Konvertatsiya")
    .text("📊 Kurslar")
    .row()
    .text("⭐ Pro")
    .text("ℹ️ Yordam")
    .resized();
const isMessageNotModifiedError = (error) => {
    if (!error || typeof error !== "object")
        return false;
    const maybe = error;
    const text = typeof maybe.description === "string" ? maybe.description : typeof maybe.message === "string" ? maybe.message : "";
    return text.toLowerCase().includes("message is not modified");
};
const isChatUnavailableError = (error) => {
    if (!error || typeof error !== "object")
        return false;
    const maybe = error;
    const text = typeof maybe.description === "string" ? maybe.description : typeof maybe.message === "string" ? maybe.message : "";
    const code = typeof maybe.error_code === "number" ? maybe.error_code : undefined;
    const normalized = text.toLowerCase();
    return (code === 403 ||
        normalized.includes("bot was blocked by the user") ||
        normalized.includes("user is deactivated") ||
        normalized.includes("chat not found"));
};
const safeEditMessageText = async (ctx, text, options) => {
    try {
        await ctx.editMessageText(text, options);
    }
    catch (error) {
        if (isMessageNotModifiedError(error))
            return;
        throw error;
    }
};
const createBot = (token, deps) => {
    const bot = new grammy_1.Bot(token);
    const userState = new Map();
    const ratesPageSize = 10;
    const alertCheckIntervalMs = env_1.env.alertCheckIntervalMs;
    const proPrice = Number.isFinite(env_1.env.proPrice) && env_1.env.proPrice > 0 ? env_1.env.proPrice : 1111;
    const proDurationDays = Number.isFinite(env_1.env.proDurationDays) ? env_1.env.proDurationDays : 30;
    const proBanksPageSize = 10;
    const sherlarPaymentService = new sherlarPaymentService_1.SherlarPaymentService();
    let alertCheckRunning = false;
    const adminIds = env_1.env.adminIds;
    const normalizedReturnUrlAllowlist = (0, clickService_1.normalizeReturnUrlList)(env_1.env.click.returnUrlAllowlist);
    const paymentTtlMinutes = Number.isFinite(env_1.env.paymentTtlMinutes) && env_1.env.paymentTtlMinutes > 0 ? env_1.env.paymentTtlMinutes : 20;
    const getUserByTelegramId = async (telegramId) => {
        if (!telegramId)
            return null;
        return deps.userRepository.findOne({ where: { telegramId } });
    };
    const ensureUser = async (ctx) => {
        const telegramId = ctx.from?.id;
        if (!telegramId)
            return null;
        const existing = await getUserByTelegramId(telegramId);
        if (existing)
            return existing;
        const user = deps.userRepository.create({
            telegramId,
            username: ctx.from?.username,
            firstName: ctx.from?.first_name,
            lastName: ctx.from?.last_name,
        });
        return deps.userRepository.save(user);
    };
    const isProUser = (user) => Boolean(user?.proUntil && user.proUntil.getTime() > Date.now());
    const formatSom = (value) => `${value.toLocaleString("en-US")} so'm`;
    const proPayLabel = (price) => `💳 Click orqali to'lov (${formatSom(price)})`;
    const isAdmin = (telegramId) => Boolean(telegramId && adminIds.includes(telegramId));
    const requireAdmin = async (ctx) => {
        if (isAdmin(ctx.from?.id))
            return true;
        await ctx.reply("⛔️ Bu buyruq faqat admin uchun!");
        return false;
    };
    const resolveReturnUrl = (botUsername) => {
        const candidate = env_1.env.click.returnUrl ?? (botUsername ? `https://t.me/${botUsername}` : undefined);
        if (!candidate)
            return null;
        const normalized = (0, clickService_1.normalizeReturnUrl)(candidate);
        if (!normalized)
            return null;
        if (!normalizedReturnUrlAllowlist.length)
            return null;
        return normalizedReturnUrlAllowlist.includes(normalized) ? normalized : null;
    };
    const addProPaymentButtons = (keyboard, payment) => {
        if (payment) {
            keyboard.url(proPayLabel(proPrice), payment.url).row();
            keyboard.text("✅ To'lovni tekshirish", `pro:check:${payment.tx}`).row();
            return keyboard;
        }
        keyboard.text(proPayLabel(proPrice), "pro:pay").row();
        return keyboard;
    };
    const buildProKeyboard = (payment) => {
        const keyboard = new grammy_1.InlineKeyboard();
        addProPaymentButtons(keyboard, payment);
        keyboard.text("⬅️ Orqaga", "menu:open:home");
        return keyboard;
    };
    const buildProOfferText = () => [
        "⭐ PRO rejimga xush kelibsiz!",
        "",
        proText(proPrice),
        "",
        "To'lov uchun pastdagi Click tugmasini bosing.",
        "To'lovdan so'ng \"To'lovni tekshirish\" ni bosing.",
    ].join("\n");
    const createProPayment = async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) {
            return { ok: false, message: "Foydalanuvchi aniqlanmadi. Qaytadan urinib ko'ring." };
        }
        if (!env_1.env.click.enabled && !env_1.env.proPaymentUrl) {
            return { ok: false, message: "To'lov tizimi sozlanmagan. Admin bilan bog'laning." };
        }
        const user = await ensureUser(ctx);
        if (!user) {
            return { ok: false, message: "Foydalanuvchi aniqlanmadi. Qaytadan urinib ko'ring." };
        }
        const returnUrl = env_1.env.click.enabled ? resolveReturnUrl(ctx.me?.username) : null;
        if (env_1.env.paymentLinkMode === "tx-only") {
            if (!env_1.env.click.enabled || !env_1.env.appBaseUrl || !returnUrl) {
                return { ok: false, message: "To'lov tizimi sozlanmagan. Admin bilan bog'laning." };
            }
            try {
                new URL(env_1.env.appBaseUrl);
            }
            catch (error) {
                console.error("Invalid APP_BASE_URL", error);
                return { ok: false, message: "To'lov tizimi sozlanmagan. Admin bilan bog'laning." };
            }
        }
        const tx = (0, clickService_1.generateTransactionParam)();
        const expiresAt = new Date(Date.now() + paymentTtlMinutes * 60 * 1000);
        const url = buildProPaymentLink(tx, proPrice, userId, returnUrl);
        const payment = deps.paymentRepository.create({
            transactionParam: tx,
            telegramId: userId,
            amount: proPrice,
            status: Payment_1.PaymentStatus.PENDING,
            expiresAt,
            metadata: {
                username: ctx.from?.username ?? null,
                firstName: ctx.from?.first_name ?? null,
                lastName: ctx.from?.last_name ?? null,
                returnUrl: returnUrl ?? null,
            },
        });
        try {
            await deps.paymentRepository.save(payment);
            console.log("[PRO_PAYMENT] created", { id: payment.id, tx, userId, amount: proPrice });
        }
        catch (error) {
            console.error("Failed to create payment", error);
            return { ok: false, message: "To'lovni yaratib bo'lmadi. Keyinroq qayta urinib ko'ring." };
        }
        return { ok: true, details: { url, tx } };
    };
    const handleProPaymentStart = async (ctx) => {
        await ctx.answerCallbackQuery();
        const result = await createProPayment(ctx);
        if (!result.ok) {
            await safeEditMessageText(ctx, result.message, { reply_markup: buildProKeyboard() });
            return;
        }
        const text = buildProOfferText();
        await safeEditMessageText(ctx, text, {
            reply_markup: buildProKeyboard(result.details),
            link_preview_options: { is_disabled: true },
        });
    };
    const handleProPaymentCheck = async (ctx, transactionParam) => {
        await ctx.answerCallbackQuery();
        const userId = ctx.from?.id;
        if (!userId) {
            await ctx.reply("Foydalanuvchi aniqlanmadi. Qaytadan urinib ko'ring.");
            return;
        }
        if (!transactionParam) {
            const message = "To'lov topilmadi. Avval to'lovni boshlang.";
            await safeEditMessageText(ctx, message, { reply_markup: buildProKeyboard() });
            return;
        }
        const payment = await deps.paymentRepository.findOne({ where: { transactionParam } });
        if (!payment || payment.telegramId !== userId) {
            console.warn("[PRO_PAYMENT] payment not found", { tx: transactionParam, userId });
            const message = "To'lov topilmadi. Qaytadan urinib ko'ring.";
            await safeEditMessageText(ctx, message, { reply_markup: buildProKeyboard() });
            return;
        }
        const user = await ensureUser(ctx);
        if (!user) {
            await ctx.reply("Foydalanuvchi aniqlanmadi. Qaytadan urinib ko'ring.");
            return;
        }
        if (payment.status === Payment_1.PaymentStatus.PENDING && payment.expiresAt && payment.expiresAt.getTime() <= Date.now()) {
            payment.status = Payment_1.PaymentStatus.FAILED;
            payment.metadata = {
                ...(payment.metadata ?? {}),
                expiredAt: new Date().toISOString(),
                expiredReason: "ttl",
            };
            await deps.paymentRepository.save(payment);
            const message = "⏳ To'lov muddati tugagan. Iltimos yangi to'lov yarating.";
            await safeEditMessageText(ctx, message, { reply_markup: buildProKeyboard() });
            return;
        }
        if (payment.status === Payment_1.PaymentStatus.PENDING) {
            console.log("[PRO_PAYMENT] pending check", { tx: transactionParam, userId, amount: proPrice });
            if (env_1.env.click.enabled) {
                const message = [
                    "⏳ To'lov hali tasdiqlanmadi.",
                    "Agar to'lov qilgan bo'lsangiz, biroz kuting va qayta tekshiring.",
                ].join("\n");
                await safeEditMessageText(ctx, message, { reply_markup: buildProKeyboard() });
                return;
            }
            const sherlarResult = await sherlarPaymentService.hasValidPayment(userId, proPrice, user.revokedAt);
            if (!sherlarResult.ok) {
                console.error("[PRO_PAYMENT] sherlar check failed", sherlarResult.error);
                const message = "To'lovni tekshirishda xatolik yuz berdi. Keyinroq qayta urinib ko'ring.";
                await safeEditMessageText(ctx, message, { reply_markup: buildProKeyboard() });
                return;
            }
            if (!sherlarResult.hasPaid) {
                const message = [
                    "⏳ To'lov hali tasdiqlanmadi.",
                    "Agar to'lov qilgan bo'lsangiz, biroz kuting va qayta tekshiring.",
                ].join("\n");
                await safeEditMessageText(ctx, message, { reply_markup: buildProKeyboard() });
                return;
            }
            if (user.revokedAt) {
                if (!sherlarResult.paymentDate || sherlarResult.paymentDate.getTime() <= user.revokedAt.getTime()) {
                    payment.metadata = {
                        ...(payment.metadata ?? {}),
                        revokedAt: user.revokedAt.toISOString(),
                        revokedSkipAt: new Date().toISOString(),
                        sherlarPaymentDate: sherlarResult.paymentDate ? sherlarResult.paymentDate.toISOString() : null,
                    };
                    await deps.paymentRepository.save(payment);
                    const message = "⛔️ Obuna bekor qilingan. PRO faollashishi uchun yangi to'lov qiling.";
                    await safeEditMessageText(ctx, message, { reply_markup: buildProKeyboard() });
                    return;
                }
            }
            const metadata = {
                ...(payment.metadata ?? {}),
                sherlarCheckedAt: new Date().toISOString(),
            };
            if (sherlarResult.paymentDate && typeof metadata.paidAt !== "string") {
                metadata.paidAt = sherlarResult.paymentDate.toISOString();
            }
            if (sherlarResult.payment) {
                metadata.sherlarPaymentId = sherlarResult.payment.id ?? null;
                metadata.sherlarPaymentStatus = sherlarResult.payment.status ?? null;
                metadata.sherlarClickPaymentId = sherlarResult.payment.click_payment_id ?? null;
                metadata.sherlarClickMerchantTransId = sherlarResult.payment.click_merchant_trans_id ?? null;
            }
            payment.status = Payment_1.PaymentStatus.PAID;
            payment.metadata = metadata;
            await deps.paymentRepository.save(payment);
            console.log("[PRO_PAYMENT] marked as paid from sherlar DB", { tx: transactionParam, userId });
        }
        if (payment.status === Payment_1.PaymentStatus.FAILED) {
            console.warn("[PRO_PAYMENT] payment failed", { tx: transactionParam, userId });
            const message = "❌ To'lov muvaffaqiyatsiz tugadi. Qayta urining.";
            await safeEditMessageText(ctx, message, { reply_markup: buildProKeyboard() });
            return;
        }
        if (user.revokedAt && payment.createdAt && payment.createdAt.getTime() <= user.revokedAt.getTime()) {
            payment.metadata = {
                ...(payment.metadata ?? {}),
                revokedAt: user.revokedAt.toISOString(),
                revokedSkipAt: new Date().toISOString(),
            };
            await deps.paymentRepository.save(payment);
            const message = "⛔️ Obuna bekor qilingan. PRO faollashishi uchun yangi to'lov qiling.";
            await safeEditMessageText(ctx, message, { reply_markup: buildProKeyboard() });
            return;
        }
        if (payment.appliedAt) {
            console.log("[PRO_PAYMENT] already applied", { tx: transactionParam, userId });
            const untilLabel = user.proUntil ? formatDate(user.proUntil) : "—";
            const message = ["✅ To'lov tasdiqlangan!", `Muddati: ${proDurationDays <= 0 ? "cheksiz" : untilLabel}`, "Asosiy menyuga qayting."].join("\n");
            await safeEditMessageText(ctx, message, { reply_markup: homeKeyboard() });
            return;
        }
        const paidAtRaw = payment.metadata && typeof payment.metadata === "object" ? payment.metadata.paidAt : undefined;
        const paidAt = typeof paidAtRaw === "string" ? new Date(paidAtRaw) : new Date();
        const updatedUntil = await (0, proService_1.applyProPayment)(deps.userRepository, user, proDurationDays, paidAt);
        payment.appliedAt = new Date();
        await deps.paymentRepository.save(payment);
        console.log("[PRO_PAYMENT] applied", { tx: transactionParam, userId, proUntil: updatedUntil.toISOString() });
        const untilLabel = proDurationDays <= 0 ? "cheksiz" : formatDate(updatedUntil);
        const message = ["✅ PRO faollashtirildi!", `Muddati: ${untilLabel}`, "Asosiy menyuga qayting."].join("\n");
        await safeEditMessageText(ctx, message, { reply_markup: homeKeyboard() });
    };
    const sendProOffer = async (ctx, opts) => {
        const text = buildProOfferText();
        const paymentResult = await createProPayment(ctx);
        const keyboard = paymentResult.ok ? buildProKeyboard(paymentResult.details) : buildProKeyboard();
        if (opts?.edit) {
            await safeEditMessageText(ctx, text, { reply_markup: keyboard });
        }
        else {
            await ctx.reply(text, { reply_markup: keyboard });
        }
    };
    const ensureProAccess = async (ctx, opts) => {
        const user = await getUserByTelegramId(ctx.from?.id);
        if (isProUser(user))
            return true;
        await sendProOffer(ctx, opts);
        return false;
    };
    const handleProEntry = async (ctx, opts) => {
        const user = await getUserByTelegramId(ctx.from?.id);
        if (isProUser(user)) {
            await sendProBankRates(ctx, "buy", { edit: opts?.edit, offset: 0 });
            return;
        }
        await sendProOffer(ctx, opts);
    };
    const parseAlertTarget = (text) => {
        if (!text || text.trim().startsWith("/"))
            return null;
        const trimmed = text.trim();
        const operatorMatch = trimmed.match(/^([<>]=?)\s*(.+)$/);
        const direction = operatorMatch?.[1]?.startsWith("<") ? "below" : "above";
        const valueText = operatorMatch?.[2] ?? trimmed;
        const amount = parseFreeAmount(valueText);
        if (amount === null)
            return null;
        return { target: amount, direction };
    };
    const getRateSnapshot = async (base, quote) => {
        // Try direct
        const direct = await deps.currencyService.getLatestAndPrevious(base, quote);
        if (direct.latest) {
            return {
                latest: Number(direct.latest.rate),
                previous: direct.previous ? Number(direct.previous.rate) : null,
                updatedAt: direct.latest.updatedAt,
            };
        }
        // Try inverse if direct absent
        const inverse = await deps.currencyService.getLatestAndPrevious(quote, base);
        if (inverse.latest && Number(inverse.latest.rate) !== 0) {
            const latestVal = 1 / Number(inverse.latest.rate);
            const prevVal = inverse.previous ? 1 / Number(inverse.previous.rate) : null;
            return { latest: latestVal, previous: prevVal, updatedAt: inverse.latest.updatedAt };
        }
        return null;
    };
    const sendRatesList = async (ctx, opts) => {
        const rates = await deps.currencyService.listAllRates();
        if (!rates.length) {
            if (opts?.edit) {
                await safeEditMessageText(ctx, "Bazadan kurslar topilmadi. Avval API dan sync qiling.");
            }
            else {
                await ctx.reply("Bazadan kurslar topilmadi. Avval API dan sync qiling.");
            }
            return;
        }
        const latestUpdated = rates.reduce((acc, r) => (!acc || r.updatedAt > acc ? r.updatedAt : acc), null);
        const header = `📊 Markaziy bank kurslari (1 birlik) — 📅 ${latestUpdated ? formatDate(latestUpdated) : "—"} | 🕒 ${latestUpdated ? formatTimeAgo(latestUpdated) : "—"}`;
        const priority = ["USD", "RUB", "EUR", "CNY", "GBP", "JPY", "AED", "TRY", "KZT", "UZS"];
        const sorted = rates
            .slice()
            .sort((a, b) => {
            const pa = priority.indexOf(a.base);
            const pb = priority.indexOf(b.base);
            if (pa !== -1 || pb !== -1) {
                if (pa === -1)
                    return 1;
                if (pb === -1)
                    return -1;
                return pa - pb;
            }
            return a.base.localeCompare(b.base);
        });
        const offset = opts?.offset ?? 0;
        const page = sorted.slice(offset, offset + ratesPageSize);
        const lines = page.map((r) => `${flagFor(r.base)} ${r.base} → ${r.quote}: ${formatRate(r.rate)}`);
        const message = [header, ...lines].join("\n");
        const nextOffset = offset + ratesPageSize;
        const keyboard = nextOffset < rates.length ? new grammy_1.InlineKeyboard().text("▶️ Davomi", `rates:more:${nextOffset}`).row().text("⬅️ Orqaga", "menu:open:home") : undefined;
        if (opts?.edit) {
            await safeEditMessageText(ctx, message, { reply_markup: keyboard ?? undefined });
        }
        else {
            await ctx.reply(message, { reply_markup: keyboard ?? undefined });
        }
    };
    const fetchProBankRates = async () => {
        try {
            const response = await (0, node_fetch_1.default)(env_1.env.proBanksUrl);
            if (!response.ok) {
                console.error(`Pro bank rates request failed (${response.status} ${response.statusText})`);
                return null;
            }
            const payload = (await response.json());
            if (!payload || typeof payload !== "object")
                return null;
            return payload;
        }
        catch (error) {
            console.error("Pro bank rates request failed", error);
            return null;
        }
    };
    const sendProBankRates = async (ctx, kind, opts) => {
        const payload = await fetchProBankRates();
        const list = kind === "sell" ? payload?.sell : payload?.buy;
        if (!payload || !Array.isArray(list) || !list.length) {
            const message = "Top banklar topilmadi. Keyinroq qayta urinib ko'ring.";
            const keyboard = new grammy_1.InlineKeyboard();
            const user = await getUserByTelegramId(ctx.from?.id);
            if (!isProUser(user)) {
                addProPaymentButtons(keyboard);
            }
            keyboard.text("⬅️ Orqaga", "menu:open:home");
            if (opts?.edit) {
                await safeEditMessageText(ctx, message, { reply_markup: keyboard });
            }
            else {
                await ctx.reply(message, { reply_markup: keyboard });
            }
            return;
        }
        const offset = Math.max(0, opts?.offset ?? 0);
        const total = list.length;
        const page = list.slice(offset, offset + proBanksPageSize);
        const title = kind === "sell" ? payload.sell_title ?? "Sotish" : payload.buy_title ?? "Sotib olish";
        const header = `🏦 Top banklar — ${formatProBankTitle(title, payload)}`;
        const lines = page.map((item, index) => {
            const name = item.bank?.trim() || "Noma'lum bank";
            return `${offset + index + 1}. ${name} — ${formatBankRate(item)}`;
        });
        const message = [header, ...lines].join("\n");
        const nextOffset = offset + proBanksPageSize;
        const keyboard = new grammy_1.InlineKeyboard().text("🏦 Sotib olish", "pro:banks:buy:0").text("🏦 Sotish", "pro:banks:sell:0").row();
        if (nextOffset < total) {
            keyboard.text("▶️ Davomi", `pro:banks:${kind}:${nextOffset}`).row();
        }
        const user = await getUserByTelegramId(ctx.from?.id);
        if (!isProUser(user)) {
            addProPaymentButtons(keyboard);
        }
        keyboard.text("⬅️ Orqaga", "menu:open:home");
        const messageOptions = { reply_markup: keyboard, link_preview_options: { is_disabled: true } };
        if (opts?.edit) {
            await safeEditMessageText(ctx, message, messageOptions);
        }
        else {
            await ctx.reply(message, messageOptions);
        }
    };
    const runAlertCheck = async () => {
        if (alertCheckRunning)
            return;
        alertCheckRunning = true;
        try {
            const alerts = await deps.alertRepository.find({ where: { isActive: true } });
            if (!alerts.length)
                return;
            try {
                await deps.currencyService.pullLatestRates(env_1.env.rateApiUrl);
            }
            catch (error) {
                console.error("Alert rate sync failed", error);
            }
            const rateCache = new Map();
            const userCache = new Map();
            const getRateInfo = async (base, quote) => {
                const key = `${base}_${quote}`;
                if (rateCache.has(key))
                    return rateCache.get(key);
                const latest = await deps.currencyService.getLatestRate(base, quote);
                if (!latest) {
                    rateCache.set(key, null);
                    return null;
                }
                const rateValue = Number(latest.rate);
                if (!Number.isFinite(rateValue)) {
                    rateCache.set(key, null);
                    return null;
                }
                const info = { rate: rateValue, updatedAt: latest.updatedAt };
                rateCache.set(key, info);
                return info;
            };
            const getUserCached = async (telegramId) => {
                if (userCache.has(telegramId))
                    return userCache.get(telegramId) ?? null;
                const user = await deps.userRepository.findOne({ where: { telegramId } });
                userCache.set(telegramId, user ?? null);
                return user ?? null;
            };
            for (const alert of alerts) {
                const rateInfo = await getRateInfo(alert.base, alert.quote);
                if (!rateInfo)
                    continue;
                const targetValue = Number(alert.targetRate);
                if (!Number.isFinite(targetValue))
                    continue;
                const shouldTrigger = alert.direction === "below" ? rateInfo.rate <= targetValue : rateInfo.rate >= targetValue;
                if (!shouldTrigger)
                    continue;
                const user = await getUserCached(Number(alert.telegramId));
                if (!isProUser(user))
                    continue;
                const directionText = alert.direction === "below" ? "pastga tushdi" : "yuqoriga ko'tarildi";
                const message = [
                    "🔔 Kurs alert ishladi",
                    `${flagFor(alert.base)} ${alert.base} → ${alert.quote}`,
                    `Maqsad: ${formatRate(targetValue)} ${alert.quote}`,
                    `Joriy: ${formatRate(rateInfo.rate)} ${alert.quote}`,
                    `Holat: kurs ${directionText}`,
                    `📅 Sana: ${formatDate(rateInfo.updatedAt)} | 🕒 ${formatTimeAgo(rateInfo.updatedAt)}`,
                ].join("\n");
                try {
                    await bot.api.sendMessage(Number(alert.telegramId), message);
                    alert.isActive = false;
                    alert.triggeredAt = new Date();
                    await deps.alertRepository.save(alert);
                }
                catch (error) {
                    console.error("Alert notification failed", error);
                    if (isChatUnavailableError(error)) {
                        alert.isActive = false;
                        alert.triggeredAt = new Date();
                        await deps.alertRepository.save(alert);
                    }
                }
            }
        }
        catch (error) {
            console.error("Alert check failed", error);
        }
        finally {
            alertCheckRunning = false;
        }
    };
    if (Number.isFinite(alertCheckIntervalMs) && alertCheckIntervalMs > 0) {
        const intervalHandle = setInterval(runAlertCheck, alertCheckIntervalMs);
        intervalHandle.unref();
    }
    const defaultCommands = [
        { command: "start", description: "Botni ishga tushirish" },
        { command: "pay", description: "PRO uchun to'lov" },
    ];
    void bot.api.setMyCommands(defaultCommands).catch((error) => console.error("Failed to set commands", error));
    if (adminIds.length) {
        const adminCommands = [
            ...defaultCommands,
            { command: "admin", description: "Admin panel" },
            { command: "revoke", description: "Obunani bekor qilish" },
        ];
        for (const adminId of adminIds) {
            void bot.api
                .setMyCommands(adminCommands, {
                scope: { type: "chat", chat_id: adminId },
            })
                .catch((error) => console.error("Failed to set admin commands", { adminId, error }));
        }
    }
    bot.command("start", async (ctx) => {
        if (ctx.from) {
            const existing = await deps.userRepository.findOne({ where: { telegramId: ctx.from.id } });
            if (!existing) {
                const user = deps.userRepository.create({
                    telegramId: ctx.from.id,
                    username: ctx.from.username,
                    firstName: ctx.from.first_name,
                    lastName: ctx.from.last_name,
                });
                await deps.userRepository.save(user);
            }
        }
        if (ctx.from)
            userState.delete(ctx.from.id);
        await ctx.reply("🏠 Asosiy menyu", { reply_markup: homeKeyboard() });
        await ctx.reply(formatHelp(), { reply_markup: commandKeyboard });
    });
    bot.command("pay", async (ctx) => {
        const user = await ensureUser(ctx);
        if (!user) {
            await ctx.reply("Foydalanuvchi aniqlanmadi. Qaytadan urinib ko'ring.");
            return;
        }
        if (isAdmin(ctx.from?.id)) {
            const updatedUntil = await (0, proService_1.applyProPayment)(deps.userRepository, user, 0);
            const message = [
                "✅ Admin uchun PRO faollashtirildi!",
                `Muddati: cheksiz (taxminan ${formatDate(updatedUntil)} gacha).`,
            ].join("\n");
            await ctx.reply(message, { reply_markup: homeKeyboard() });
            return;
        }
        await sendProOffer(ctx);
    });
    bot.command("admin", async (ctx) => {
        const ok = await requireAdmin(ctx);
        if (!ok)
            return;
        const text = [
            "👑 Admin panel",
            "",
            "Buyruqlar:",
            "/pay — o'zingiz uchun PRO'ni faollashtirish",
            "/revoke TELEGRAM_ID — obunani bekor qilish",
        ].join("\n");
        await ctx.reply(text);
    });
    bot.command("revoke", async (ctx) => {
        const ok = await requireAdmin(ctx);
        if (!ok)
            return;
        const text = ctx.message?.text ?? "";
        const parts = text.split(" ").map((item) => item.trim()).filter(Boolean);
        if (parts.length < 2) {
            await ctx.reply("Foydalanish: /revoke TELEGRAM_ID");
            return;
        }
        const telegramId = Number(parts[1]);
        if (!Number.isFinite(telegramId) || telegramId <= 0) {
            await ctx.reply("Noto'g'ri TELEGRAM_ID");
            return;
        }
        const user = await deps.userRepository.findOne({ where: { telegramId } });
        if (!user) {
            await ctx.reply("Foydalanuvchi topilmadi.");
            return;
        }
        user.proUntil = null;
        user.revokedAt = new Date();
        await deps.userRepository.save(user);
        await ctx.reply(`✅ Obuna bekor qilindi: ${telegramId}`);
    });
    // Asosiy oqim tugmalar orqali ishlaydi; /pay adminlar va xohlagan foydalanuvchi uchun qo'llab-quvvatlanadi.
    bot.on("message:text", async (ctx, next) => {
        const text = ctx.message?.text ?? "";
        const userId = ctx.from?.id;
        const state = userId ? userState.get(userId) : undefined;
        const normalized = text.trim().toLowerCase();
        if (normalized === "💱 konvertatsiya" || normalized === "konvertatsiya") {
            await ctx.reply("Qaysi yo'nalishda?", { reply_markup: convertPairKeyboard() });
            return;
        }
        if (normalized === "📊 kurslar" || normalized === "kurslar") {
            await sendRatesList(ctx);
            return;
        }
        if (normalized === "⭐ pro" || normalized === "pro") {
            await handleProEntry(ctx);
            return;
        }
        if (normalized === "🔔 kursni kuzatish" || normalized === "kursni kuzatish") {
            const hasAccess = await ensureProAccess(ctx);
            if (!hasAccess)
                return;
            await ctx.reply("Qaysi valyutani kuzatasiz?", { reply_markup: alertsKeyboard() });
            return;
        }
        if (normalized === "ℹ️ yordam" || normalized === "yordam") {
            await ctx.reply("Yordam bo'limi:", { reply_markup: helpKeyboard() });
            return;
        }
        if (state?.convertPair) {
            const amount = parseFreeAmount(text);
            if (amount === null) {
                await ctx.reply("Miqdor kiriting. Misol: 120 yoki 50000");
                return;
            }
            if (amount <= 0) {
                await ctx.reply("Miqdor 0 dan katta bo'lishi kerak. Misol: 120 yoki 500");
                return;
            }
            const [base, quote] = state.convertPair.split("_");
            const snap = await getRateSnapshot(base, quote);
            if (!snap) {
                await ctx.reply(`${base} ➝ ${quote} kursi topilmadi. Avval kursni sync qiling.`);
                return;
            }
            const rate = snap.latest;
            const converted = amount * rate;
            const inverse = rate > 0 ? 1 / rate : null;
            const delta = snap.previous !== null ? rate - snap.previous : null;
            const response = [
                "💵 Konvertatsiya natijasi",
                `${flagFor(base)} ${formatAmount(amount)} ${base} ➝ ${flagFor(quote)} ${formatAmount(converted)} ${quote}`,
                inverse ? `1 ${quote} = ${formatRate(inverse)} ${base}` : `1 ${base} = ${formatRate(rate)} ${quote}`,
                delta !== null ? `O'zgarish: ${formatDelta(delta)} ${trendEmoji(delta)}` : undefined,
                `📅 Sana: ${formatDate(snap.updatedAt)} | 🕒 ${formatTimeAgo(snap.updatedAt)}`,
            ]
                .filter(Boolean)
                .join("\n");
            await ctx.reply(response, { reply_markup: convertPairKeyboard() });
            return;
        }
        if (state?.alertCurrency) {
            const parsed = parseAlertTarget(text);
            if (!parsed) {
                await ctx.reply("Narxni raqam ko'rinishida yuboring. Misol: 12500, > 12500 yoki < 12500");
                return;
            }
            if (parsed.target <= 0) {
                await ctx.reply("Maqsad narxi 0 dan katta bo'lishi kerak. Misol: 12500, > 12500 yoki < 12500");
                return;
            }
            if (!userId) {
                await ctx.reply("Foydalanuvchi aniqlanmadi. Qaytadan urinib ko'ring.");
                return;
            }
            const user = await getUserByTelegramId(userId);
            if (!isProUser(user)) {
                userState.delete(userId);
                await sendProOffer(ctx);
                return;
            }
            const base = state.alertCurrency;
            const quote = "UZS";
            const snap = await getRateSnapshot(base, quote);
            if (!snap) {
                await ctx.reply(`${base} ➝ ${quote} kursi topilmadi. Avval kursni sync qiling.`);
                return;
            }
            const targetRate = parsed.target.toFixed(6);
            const duplicate = await deps.alertRepository.findOne({
                where: {
                    telegramId: userId,
                    base,
                    quote,
                    targetRate,
                    direction: parsed.direction,
                    isActive: true,
                },
            });
            if (duplicate) {
                await ctx.reply("Bu shart bilan aktiv alert allaqachon mavjud. Boshqa qiymat yuboring.", { reply_markup: alertsKeyboard() });
                return;
            }
            const alert = deps.alertRepository.create({
                telegramId: userId,
                base,
                quote,
                targetRate,
                direction: parsed.direction,
                isActive: true,
            });
            await deps.alertRepository.save(alert);
            state.alertCurrency = undefined;
            const directionHint = parsed.direction === "below" ? "pastga tushsa" : "yuqoriga ko'tarilsa";
            const confirmation = [
                "✅ Alert saqlandi",
                `${flagFor(alert.base)} ${alert.base} → ${alert.quote}`,
                `Shart: kurs ${directionHint} ${formatRate(parsed.target)} ${alert.quote}`,
                `Joriy: ${formatRate(snap.latest)} ${alert.quote}`,
                `📅 Sana: ${formatDate(snap.updatedAt)} | 🕒 ${formatTimeAgo(snap.updatedAt)}`,
                "Alert ishlaganda xabar yuboramiz.",
            ].join("\n");
            await ctx.reply(confirmation, { reply_markup: alertsKeyboard() });
            return;
        }
        const usdAmount = parseUsdInlineAmount(text);
        if (usdAmount === null)
            return next();
        if (usdAmount <= 0) {
            await ctx.reply("Miqdor 0 dan katta bo'lishi kerak. Misol: 100$, 250 usd");
            return;
        }
        const snap = await getRateSnapshot("USD", "UZS");
        if (!snap) {
            await ctx.reply("USD ➝ UZS kursi topilmadi. Avval kursni sync qiling.");
            return;
        }
        const rate = snap.latest;
        const converted = usdAmount * rate;
        const delta = snap.previous !== null ? rate - snap.previous : null;
        const response = [
            "💸 USD ➝ UZS tezkor hisob-kitob",
            `${flagFor("USD")} ${formatAmount(usdAmount)} USD ➝ ${flagFor("UZS")} ${formatAmount(converted)} UZS`,
            `📊 Kurs: ${formatRate(rate)} UZS`,
            delta !== null ? `O'zgarish: ${formatDelta(delta)} ${trendEmoji(delta)}` : undefined,
            `📅 Sana: ${formatDate(snap.updatedAt)} | 🕒 ${formatTimeAgo(snap.updatedAt)}`,
            "Yo'nalishni o'zgartirish uchun \"Konvertatsiya\" tugmasini bosing.",
        ]
            .filter(Boolean)
            .join("\n");
        await ctx.reply(response, { reply_markup: homeKeyboard() });
    });
    bot.on("callback_query:data", async (ctx) => {
        const data = ctx.callbackQuery.data ?? "";
        const parts = data.split(":");
        const module = parts[0];
        const action = parts[1];
        const value = parts[2];
        const extra = parts[3];
        const userId = ctx.from?.id;
        const ensureState = () => {
            if (!userId)
                return {};
            const existing = userState.get(userId) ?? {};
            userState.set(userId, existing);
            return existing;
        };
        switch (module) {
            case "menu": {
                await ctx.answerCallbackQuery();
                if (action === "open") {
                    if (value === "home") {
                        if (userId)
                            userState.delete(userId);
                        await safeEditMessageText(ctx, "🏠 Asosiy menyu", { reply_markup: homeKeyboard() });
                    }
                    else if (value === "convert") {
                        await safeEditMessageText(ctx, "Qaysi yo'nalishda?", { reply_markup: convertPairKeyboard() });
                    }
                    else if (value === "rates") {
                        await sendRatesList(ctx, { edit: true });
                    }
                    else if (value === "alerts") {
                        const hasAccess = await ensureProAccess(ctx, { edit: true });
                        if (!hasAccess)
                            return;
                        await safeEditMessageText(ctx, "Qaysi valyutani kuzatasiz?", { reply_markup: alertsKeyboard() });
                    }
                    else if (value === "pro") {
                        await handleProEntry(ctx, { edit: true });
                    }
                    else if (value === "help") {
                        await safeEditMessageText(ctx, "Yordam bo'limi:", { reply_markup: helpKeyboard() });
                    }
                }
                return;
            }
            case "convert": {
                if (action === "pair") {
                    const [base, quote] = value?.split("_") ?? [];
                    if (!base || !quote) {
                        await ctx.answerCallbackQuery({ text: "Juftlik noto'g'ri" });
                        return;
                    }
                    await ctx.answerCallbackQuery();
                    if (userId) {
                        const st = ensureState();
                        st.convertPair = `${base}_${quote}`;
                    }
                    await safeEditMessageText(ctx, [
                        `Tanlandi: ${base} ➝ ${quote}`,
                        "Istalgan miqdorni kiriting (masalan: 120 yoki 50000) — natijani shu yerning o'zida ko'rsatasiz.",
                    ].join("\n"), { reply_markup: convertPairKeyboard() });
                    return;
                }
                break;
            }
            case "rates": {
                if (action === "more") {
                    const next = Number(value);
                    if (!Number.isFinite(next)) {
                        await ctx.answerCallbackQuery({ text: "Offset noto'g'ri" });
                        return;
                    }
                    await ctx.answerCallbackQuery();
                    await sendRatesList(ctx, { offset: next });
                    return;
                }
                break;
            }
            case "alert": {
                if (action === "create" && value) {
                    await ctx.answerCallbackQuery();
                    const hasAccess = await ensureProAccess(ctx, { edit: true });
                    if (!hasAccess)
                        return;
                    if (userId) {
                        const st = ensureState();
                        st.alertCurrency = value.toUpperCase();
                    }
                    await safeEditMessageText(ctx, [
                        `🔔 ${value.toUpperCase()} uchun alert sozlash`,
                        "Qaysi narxdan xabar beray? Masalan: 12500, > 12500 yoki < 12500",
                        "Bu funksiya PRO rejimida ishlaydi.",
                    ].join("\n"), { reply_markup: alertsKeyboard() });
                    return;
                }
                break;
            }
            case "pro": {
                if (action === "pay") {
                    await handleProPaymentStart(ctx);
                    return;
                }
                if (action === "check") {
                    await handleProPaymentCheck(ctx, value);
                    return;
                }
                if (action === "banks") {
                    const kind = value === "sell" ? "sell" : "buy";
                    const offset = extra ? Number(extra) : 0;
                    if (!Number.isFinite(offset) || offset < 0) {
                        await ctx.answerCallbackQuery({ text: "Offset noto'g'ri" });
                        return;
                    }
                    await ctx.answerCallbackQuery();
                    await sendProBankRates(ctx, kind, { edit: true, offset });
                    return;
                }
                if (action === "buy") {
                    await ctx.answerCallbackQuery();
                    await sendProOffer(ctx, { edit: true });
                    return;
                }
                break;
            }
            case "help": {
                await ctx.answerCallbackQuery();
                const message = action === "topic" && value === "how"
                    ? [
                        "Bot qanday ishlaydi:",
                        "1) Konvertatsiya ni bosing, yo'nalishni tanlang (UZS ↔ USD/EUR/RUB/CNY).",
                        "2) Istalgan miqdorni yozing — natija va kurs shu chatda chiqadi.",
                        "3) Kurslar bo'limida barcha juftliklarning oxirgi qiymatlari bor.",
                    ].join("\n")
                    : action === "topic" && value === "source"
                        ? "Kurslar manbasi: O'zbekiston Markaziy Banki (cbu.uz) API dan olinadi va bazaga saqlanadi."
                        : "Yordam bo'limi.";
                await safeEditMessageText(ctx, message, { reply_markup: helpKeyboard() });
                return;
            }
            default:
                break;
        }
        await ctx.answerCallbackQuery({ text: "Noma'lum amal" });
    });
    bot.catch(async (err) => {
        console.error("Bot error", err);
        await err.ctx.reply("Kutilmagan xatolik yuz berdi, keyinroq urinib ko'ring.");
    });
    return bot;
};
exports.createBot = createBot;
const CURRENCY_FLAGS = {
    USD: "🇺🇸",
    EUR: "🇪🇺",
    RUB: "🇷🇺",
    GBP: "🇬🇧",
    JPY: "🇯🇵",
    QAR: "🇶🇦",
    KGS: "🇰🇬",
    NZD: "🇳🇿",
    YER: "🇾🇪",
    IRR: "🇮🇷",
    SEK: "🇸🇪",
    CHF: "🇨🇭",
    CZK: "🇨🇿",
    CNY: "🇨🇳",
    PHP: "🇵🇭",
    UYU: "🇺🇾",
    OMR: "🇴🇲",
    UAH: "🇺🇦",
    TMT: "🇹🇲",
    TRY: "🇹🇷",
    TND: "🇹🇳",
    TJS: "🇹🇯",
    THB: "🇹🇭",
    SYP: "🇸🇾",
    SDG: "🇸🇩",
    SGD: "🇸🇬",
    RSD: "🇷🇸",
    XDR: "🌐",
    SAR: "🇸🇦",
    RON: "🇷🇴",
    KWD: "🇰🇼",
    PLN: "🇵🇱",
    PKR: "🇵🇰",
    AZN: "🇦🇿",
    NOK: "🇳🇴",
    MMK: "🇲🇲",
    MNT: "🇲🇳",
    MDL: "🇲🇩",
    EGP: "🇪🇬",
    MXN: "🇲🇽",
    MAD: "🇲🇦",
    MYR: "🇲🇾",
    LYD: "🇱🇾",
    LBP: "🇱🇧",
    LAK: "🇱🇦",
    CUP: "🇨🇺",
    KRW: "🇰🇷",
    CAD: "🇨🇦",
    KHR: "🇰🇭",
    ILS: "🇮🇱",
    ISK: "🇮🇸",
    IQD: "🇮🇶",
    JOD: "🇯🇴",
    IDR: "🇮🇩",
    ZAR: "🇿🇦",
    DZD: "🇩🇿",
    DKK: "🇩🇰",
    GEL: "🇬🇪",
    VND: "🇻🇳",
    VES: "🇻🇪",
    HUF: "🇭🇺",
    BND: "🇧🇳",
    BRL: "🇧🇷",
    BGN: "🇧🇬",
    BYN: "🇧🇾",
    BHD: "🇧🇭",
    BDT: "🇧🇩",
    AED: "🇦🇪",
    AFN: "🇦🇫",
    AMD: "🇦🇲",
    ARS: "🇦🇷",
    KZT: "🇰🇿",
    AUD: "🇦🇺",
    INR: "🇮🇳",
    HKD: "🇭🇰",
    UZS: "🇺🇿",
};
const chunkMessage = (message, limit = 3800) => {
    if (message.length <= limit)
        return [message];
    const lines = message.split("\n");
    const chunks = [];
    let current = "";
    for (const line of lines) {
        if ((current + line + "\n").length > limit && current.length > 0) {
            chunks.push(current.trimEnd());
            current = "";
        }
        current += line + "\n";
    }
    if (current.trim().length) {
        chunks.push(current.trimEnd());
    }
    return chunks;
};
const flagFor = (code) => CURRENCY_FLAGS[code] ?? "🏳️";
const formatRate = (rate) => {
    const num = Number(rate);
    if (!Number.isFinite(num))
        return String(rate);
    return num.toFixed(6).replace(/\.?0+$/, "");
};
const formatAmount = (value) => Number.isFinite(value) ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value);
const formatBankRate = (entry) => {
    const text = typeof entry.rate_text === "string" ? entry.rate_text.trim() : "";
    if (text)
        return text;
    if (typeof entry.rate === "number" && Number.isFinite(entry.rate)) {
        return `${entry.rate.toLocaleString("en-US")} so'm`;
    }
    return "—";
};
const normalizeProBankDate = (value) => {
    if (!value)
        return null;
    const text = value.trim();
    const dayFirst = text.match(/(\d{2})[.\-/](\d{2})[.\-/](\d{2}|\d{4})/);
    if (dayFirst) {
        const year = dayFirst[3].length === 2 ? `20${dayFirst[3]}` : dayFirst[3];
        return `${dayFirst[1]}.${dayFirst[2]}.${year}`;
    }
    const yearFirst = text.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})/);
    if (yearFirst) {
        return `${yearFirst[3]}.${yearFirst[2]}.${yearFirst[1]}`;
    }
    return null;
};
const UZBEK_MONTHS = [
    "yanvar",
    "fevral",
    "mart",
    "aprel",
    "may",
    "iyun",
    "iyul",
    "avgust",
    "sentabr",
    "oktabr",
    "noyabr",
    "dekabr",
];
const parseNormalizedDateParts = (value) => {
    const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match)
        return null;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year))
        return null;
    if (day < 1 || day > 31 || month < 1 || month > 12)
        return null;
    return { day, month, year };
};
const formatUzbekMonthDay = (day, month) => {
    const monthName = UZBEK_MONTHS[month - 1];
    if (!monthName)
        return String(day);
    return `${day} - ${monthName}`;
};
const resolveProBankDateLabel = (payload) => {
    const normalized = normalizeProBankDate(payload.source) ??
        normalizeProBankDate(payload.sell_title) ??
        normalizeProBankDate(payload.buy_title);
    const parsed = normalized ? parseNormalizedDateParts(normalized) : null;
    if (parsed) {
        return { label: formatUzbekMonthDay(parsed.day, parsed.month), fromPayload: true };
    }
    const now = new Date();
    return { label: formatUzbekMonthDay(now.getDate(), now.getMonth() + 1), fromPayload: false };
};
const formatProBankTitle = (title, payload) => {
    const { label: dateLabel, fromPayload } = resolveProBankDateLabel(payload);
    const datePattern = /(\d{2})[.\-/](\d{2})[.\-/](\d{2}|\d{4})/;
    if (datePattern.test(title)) {
        return fromPayload ? title.replace(datePattern, dateLabel) : title;
    }
    const monthPattern = new RegExp(`\\b(?:${UZBEK_MONTHS.join("|")})\\b`, "i");
    if (monthPattern.test(title))
        return title;
    return `${title} (${dateLabel})`;
};
const parseUsdInlineAmount = (text) => {
    if (!text || text.trim().startsWith("/"))
        return null;
    const trimmed = text.trim();
    if (/^(usd|\$)$/i.test(trimmed))
        return 1;
    const match = trimmed.match(/^(?:\$|usd)?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:usd|\$)?\s*$/i);
    if (!match)
        return null;
    const amount = Number(match[1].replace(",", "."));
    return Number.isFinite(amount) ? amount : null;
};
const parseFreeAmount = (text) => {
    if (!text || text.trim().startsWith("/"))
        return null;
    const normalized = text.replace(/\s+/g, "").replace(",", ".");
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : null;
};
const formatTimeAgo = (date) => {
    const diffMs = Date.now() - date.getTime();
    const mins = Math.max(0, Math.floor(diffMs / 60000));
    if (mins < 1)
        return "hozir";
    if (mins < 60)
        return `${mins} daqiqa oldin`;
    const hours = Math.floor(mins / 60);
    if (hours < 24)
        return `${hours} soat oldin`;
    const days = Math.floor(hours / 24);
    return `${days} kun oldin`;
};
const formatDelta = (value) => {
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    return `${sign}${formatRate(Math.abs(value))}`;
};
const trendEmoji = (value) => {
    if (value > 0)
        return "📈";
    if (value < 0)
        return "📉";
    return "⏸️";
};
const formatDate = (value) => {
    const yyyy = value.getUTCFullYear();
    const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(value.getUTCDate()).padStart(2, "0");
    return `${dd}.${mm}.${yyyy}`;
};
const proText = (price) => [
    "Har kuni USD bo'yicha eng arzon sotib olish va eng foydali sotish banklarini topamiz.",
    "Top banklar ro'yxati birinchi bo'lib sizga keladi.",
    "🔔 Kurs alertlari (USD/EUR va boshqalar).",
    "🔓 Bir marta to'lov qiling — butun umr ^PRO^dan foydalaning. PRO valyuta ayrboshlashda har kunlik sizga eng qulay bo'lgan banklarni taqdim etadi ",
    `Narx: ${price.toLocaleString("en-US")} so'm (bir martalik)`,
].join("\n");
const buildProPaymentLink = (tx, amount, userId, returnUrl, baseUrl = env_1.env.proPaymentUrl) => {
    if (env_1.env.paymentLinkMode === "tx-only" && env_1.env.click.enabled && env_1.env.appBaseUrl) {
        try {
            const url = new URL("/pay", env_1.env.appBaseUrl);
            url.searchParams.set("tx", tx);
            return url.toString();
        }
        catch (error) {
            console.error("Invalid APP_BASE_URL, falling back to PRO_PAYMENT_URL", error);
        }
    }
    const params = new URLSearchParams({ amount: String(amount), tx });
    if (userId)
        params.set("user_id", String(userId));
    if (returnUrl)
        params.set("return_url", returnUrl);
    try {
        const url = new URL(baseUrl);
        params.forEach((value, key) => url.searchParams.set(key, value));
        return url.toString();
    }
    catch (error) {
        console.error("Invalid PRO_PAYMENT_URL, falling back to string concat", error);
        const separator = baseUrl.includes("?") ? "&" : "?";
        return `${baseUrl}${separator}${params.toString()}`;
    }
};
//# sourceMappingURL=bot.js.map