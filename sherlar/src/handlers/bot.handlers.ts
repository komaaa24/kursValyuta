import { Context, InlineKeyboard } from "grammy";
import { Poem } from "../entities/Poem.js";
import { User } from "../entities/User.js";
import { Payment, PaymentStatus } from "../entities/Payment.js";
import { AppDataSource } from "../database/data-source.js";
import { UserService } from "../services/user.service.js";
import { fetchPoemsFromAPI, formatPoem } from "../services/poem.service.js";
import { generatePaymentLink, generateTransactionParam, getFixedPaymentAmount } from "../services/click.service.js";
import { writeFile } from "fs/promises";
import path from "path";
import axios from "axios";
import { SherlarPaymentService } from "../services/sherlar-payment.service.js";
import { buildScopedKey, getBotUsernameFromContext, normalizeBotUsername } from "../utils/bot-scope.js";

const userService = new UserService();
const sherlarPaymentService = new SherlarPaymentService();

// In-memory session storage
interface UserSession {
    poems: Poem[];
    currentIndex: number;
}

const sessions = new Map<string, UserSession>();

async function markScopedPaymentAsPaid(
    payment: Payment,
    telegramId: number,
    botUsername: string,
    source: string,
    paidAt?: Date,
    externalPayment?: Record<string, unknown>,
) {
    const paymentRepo = AppDataSource.getRepository(Payment);
    const scopedBotUsername = normalizeBotUsername(botUsername);

    payment.status = PaymentStatus.PAID;
    payment.botUsername = scopedBotUsername;
    payment.metadata = {
        ...payment.metadata,
        telegramId,
        botUsername: scopedBotUsername,
        paidAt: paidAt?.toISOString() ?? new Date().toISOString(),
        verifiedBy: source,
        sherlarPayment: externalPayment ?? null,
    };

    await paymentRepo.save(payment);
    await userService.markAsPaid(telegramId, scopedBotUsername);
}

async function syncScopedPendingPayments(user: User, botUsername: string): Promise<boolean> {
    const paymentRepo = AppDataSource.getRepository(Payment);
    const scopedBotUsername = normalizeBotUsername(botUsername);
    const pendingPayments = await paymentRepo.find({
        where: {
            userId: user.id,
            botUsername: scopedBotUsername,
            status: PaymentStatus.PENDING,
        },
        order: {
            createdAt: "DESC",
        },
        take: 5,
    });

    for (const pendingPayment of pendingPayments) {
        const paymentResult = await sherlarPaymentService.findPaidPaymentByTransaction(
            user.telegramId,
            pendingPayment.transactionParam,
        );

        if (!paymentResult.hasPaid) {
            continue;
        }

        if (user.revokedAt && paymentResult.paymentDate && paymentResult.paymentDate < user.revokedAt) {
            console.log(
                `⚠️ [START] Payment ${pendingPayment.transactionParam} is older than revoke date for ${user.telegramId}.`,
            );
            continue;
        }

        await markScopedPaymentAsPaid(
            pendingPayment,
            user.telegramId,
            scopedBotUsername,
            "start_pending_sync",
            paymentResult.paymentDate,
            paymentResult.payment,
        );
        return true;
    }

    return false;
}

/**
 * /start komandasi
 */
export async function handleStart(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    const botUsername = getBotUsernameFromContext(ctx);

    // Foydalanuvchini yaratish/yangilash
    const user = await userService.findOrCreate(userId, botUsername, {
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
        lastName: ctx.from?.last_name
    });

    // 🔍 Smart payment verification strategy:
    // 1. Agar hasPaid=true -> hech narsa qilmaymiz (tasdiqlangan)
    // 2. Agar hasPaid=false -> sherlar DB ni tekshiramiz
    // 3. Agar admin revoke qilgan bo'lsa (revokedAt mavjud) -> qayta tasdiqlamaymiz
    // 4. To'lov topilsa -> FAQAT database'ni yangilaymiz, xabar YUBORMAYMIZ (webhook allaqachon yuborgan)
    if (!user.hasPaid) {
        console.log(`🔍 [START] Checking pending payments for user ${userId} in bot ${botUsername}`);
        try {
            const synced = await syncScopedPendingPayments(user, botUsername);
            if (synced) {
                console.log(`✅ [START] Pending payment synced for user ${userId} in bot ${botUsername}`);
            } else {
                console.log(`ℹ️ [START] No matching paid transaction found for user ${userId} in bot ${botUsername}`);
            }
        } catch (error) {
            console.error("❌ [START] Sherlar DB check error:", error);
        }
    }

    // To'g'ridan-to'g'ri she'rlarni ko'rsatish (menyu xabarsiz)
    await handleShowPoems(ctx);
}

/**
 * She'rlarni ko'rsatish
 */
export async function handleShowPoems(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    const botUsername = getBotUsernameFromContext(ctx);

    const poemRepo = AppDataSource.getRepository(Poem);

    // HAR SAFAR yangi tekshiruv (revoke uchun)
    const hasPaid = await userService.hasPaid(userId, botUsername);

    // FAQAT /start da sherlar DB tekshiriladi, bu yerda EMAS!

    // Agar DB bo'sh bo'lsa, API dan yuklaymiz
    const count = await poemRepo.count();
    if (count === 0) {
        await syncPoemsFromAPI();
    }

    // Tasodifiy she'rlarni olish
    let poems;
    if (hasPaid) {
        // To'lagan foydalanuvchilar uchun BARCHA she'rlarni ko'rsatish
        poems = await poemRepo
            .createQueryBuilder("poem")
            .orderBy("RANDOM()")
            .getMany();
    } else {
        // To'lamagan foydalanuvchilar uchun faqat 5 ta
        poems = await poemRepo
            .createQueryBuilder("poem")
            .orderBy("RANDOM()")
            .limit(5)
            .getMany();
    }

    if (poems.length === 0) {
        await ctx.answerCallbackQuery({
            text: "She'rlar topilmadi 😔",
            show_alert: true
        });
        return;
    }

    // Session yaratish
    sessions.set(buildScopedKey(botUsername, userId), {
        poems,
        currentIndex: 0
    });

    await showPoem(ctx, userId, botUsername, 0);
}

/**
 * She'rni ko'rsatish - oddiy matn
 */
async function showPoem(ctx: Context, userId: number, botUsername: string, index: number) {
    const session = sessions.get(buildScopedKey(botUsername, userId));
    if (!session) return;

    const poem = session.poems[index];
    const total = session.poems.length;
    const hasPaid = await userService.hasPaid(userId, botUsername);

    // Ko'rilgan she'rlar sonini oshirish
    await userService.incrementViewedAnecdotes(userId, botUsername);

    // Increment views
    const poemRepo = AppDataSource.getRepository(Poem);
    poem.views += 1;
    await poemRepo.save(poem);

    const keyboard = new InlineKeyboard();

    if (index < total - 1) {
        keyboard.text("Keyingi", `next:${index + 1}`);
    }

    // Agar to'lov qilmagan bo'lsa va oxirgi she'r ko'rsatilayotgan bo'lsa
    if (!hasPaid && index === total - 1) {
        keyboard.row();
        keyboard.text("✨ Davom etish uchun", "payment");
    }

    // Chiroyli kreativ format bilan she'rni ko'rsatish
    let text = `╭─────── ✦ ───────╮\n`;
    text += `       💕 <b>Sevgi She'ri</b> 💕\n`;
    text += `╰─────── ✦ ───────╯\n\n`;

    // She'r matni - har qatorni ajratib
    const lines = poem.content.split('\n');
    lines.forEach(line => {
        if (line.trim()) {
            text += `  🌹 <i>${line.trim()}</i>\n`;
        }
    });

    text += `\n╰─────── ✦ ───────╯\n`;

    // Matnni yuborish
    if (ctx.callbackQuery) {
        await ctx.editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });
        await ctx.answerCallbackQuery();
    } else {
        await ctx.reply(text, {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });
    }
}

/**
 * Keyingi/oldingi she'r
 */
/**
 * Keyingi/Oldingi she'rni ko'rsatish
 */
export async function handleNext(ctx: Context, index: number) {
    const userId = ctx.from?.id;
    if (!userId) return;
    const botUsername = getBotUsernameFromContext(ctx);

    // HAR SAFAR hasPaid ni tekshirish (revoke uchun muhim!)
    const hasPaid = await userService.hasPaid(userId, botUsername);
    const session = sessions.get(buildScopedKey(botUsername, userId));

    if (!session) {
        await ctx.answerCallbackQuery({
            text: "Session tugagan. /start ni bosing.",
            show_alert: true
        });
        return;
    }

    // Agar revoke qilingan bo'lsa va 5 tadan ko'p she'r ko'rmoqchi bo'lsa
    if (!hasPaid && index >= 5) {
        await ctx.answerCallbackQuery({
            text: "❌ Obunangiz bekor qilindi! Faqat 5 ta bepul she'r.",
            show_alert: true
        });

        // To'lov tugmasini ko'rsatish
        const keyboard = new InlineKeyboard()
            .text("💳 To'lov qilish", "payment");

        await ctx.editMessageText(
            `⚠️ <b>Obunangiz bekor qilindi!</b>\n\n` +
            `Siz faqat 5 ta bepul she'rni ko'rishingiz mumkin.\n\n` +
            `Cheksiz she'rlardan bahramand bo'lish uchun qaytadan to'lov qiling.`,
            {
                reply_markup: keyboard,
                parse_mode: "HTML"
            }
        );
        return;
    }

    await showPoem(ctx, userId, botUsername, index);
}

/**
 * To'lov oynasini ko'rsatish
 */
export async function handlePayment(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    const botUsername = getBotUsernameFromContext(ctx);

    const user = await userService.findOrCreate(userId, botUsername);

    if (user.hasPaid) {
        await ctx.answerCallbackQuery({
            text: "Siz allaqachon to'lov qilgansiz! ✅",
            show_alert: true
        });
        return;
    }

    // To'lov parametrlari - qat'iy narx
    const amount = getFixedPaymentAmount(); // 1111 so'm
    const transactionParam = generateTransactionParam();

    // Payment record yaratish
    const paymentRepo = AppDataSource.getRepository(Payment);
    const payment = paymentRepo.create({
        transactionParam,
        userId: user.id,
        botUsername,
        amount,
        status: PaymentStatus.PENDING,
        metadata: {
            telegramId: userId,
            username: ctx.from?.username,
            botUsername,
        }
    });
    await paymentRepo.save(payment);

    // Oddiy to'lov linkini yaratish (user_id va return_url bilan)
    const returnUrl = `https://t.me/${botUsername}`;

    const paymentLink = generatePaymentLink({
        amount,
        transactionParam,
        userId, // Telegram ID qo'shish
        botUsername,
        returnUrl // To'lovdan keyin botga qaytish
    });

    const keyboard = new InlineKeyboard()
        .url("💳 To'lash", paymentLink.url)
        .row()
        .text("✅ To'lovni tekshirish", `check_payment:${payment.id}`);

    await ctx.editMessageText(
        `💎 <b>Premium kirish – bir martalik imkoniyat</b>\n\n` +
        `💰 To'lov: atigi <b>${amount.toLocaleString()} so'm</b>\n` +
        `📚 Bir marta to'laysiz — cheksiz foydalanasiz!\n\n` +
        `✨ Sizni yuzlab nafis va yurakka yetib boradigan sevgi she'rlari kutmoqda.\n` +
        `💖 Har kuni yangi tuyg'ular, yangi satrlar.\n` +
        `🔓 To'lovdan so'ng bot umrbod sizniki — hech qanday oylik to'lov, hech qanday cheklov yo'q.\n\n` +
        `📤 O'qing, seving, ulashing — istagan paytingiz, istagan odam bilan.\n\n` +
        `👉 ${amount.toLocaleString()} so'm — bu bir piyola choy narxi, ammo his-tuyg'ular cheksiz.\n\n` +
        `📱 <b>To'lash tartibi:</b>\n` +
        `1️⃣ "To'lash" tugmasini bosing\n` +
        `2️⃣ To'lovni amalga oshiring\n` +
        `3️⃣ "To'lovni tekshirish" ni bosing`,
        {
            reply_markup: keyboard,
            parse_mode: "HTML"
        }
    );
}

/**
 * To'lovni tekshirish
 */
export async function handleCheckPayment(ctx: Context, paymentId: number) {
    const userId = ctx.from?.id;
    if (!userId) return;
    const botUsername = getBotUsernameFromContext(ctx);

    const paymentRepo = AppDataSource.getRepository(Payment);
    const payment = await paymentRepo.findOne({
        where: { id: paymentId, botUsername },
        relations: ["user"]
    });

    if (!payment || payment.user?.telegramId !== userId) {
        await ctx.answerCallbackQuery({
            text: "To'lov topilmadi ❌",
            show_alert: true
        });
        return;
    }

    // Agar allaqachon to'langan bo'lsa
    if (payment.status === PaymentStatus.PAID) {
        await ctx.answerCallbackQuery({
            text: "To'lovingiz tasdiqlandi! ✅",
            show_alert: true
        });

        await ctx.editMessageText(
            `✅ <b>To'lov muvaffaqiyatli!</b>\n\n` +
            `Endi siz cheksiz she'rlardan bahramand bo'lishingiz mumkin! 🎉\n\n` +
            `Davom etish uchun /start bosing.`,
            { parse_mode: "HTML" }
        );
        return;
    }

    // Agar PENDING bo'lsa, sherlar DB'dan tekshiramiz
    if (payment.status === PaymentStatus.PENDING) {
        await ctx.answerCallbackQuery({
            text: "🔍 To'lov tekshirilmoqda...",
            show_alert: false
        });

        console.log(`🔍 [CHECK_PAYMENT] Checking tx=${payment.transactionParam} for user ${userId} in bot ${botUsername}`);

        try {
            const paymentResult = await sherlarPaymentService.findPaidPaymentByTransaction(
                userId,
                payment.transactionParam,
            );

            if (paymentResult.hasPaid) {
                console.log(`✅ [CHECK_PAYMENT] Payment found in sherlar DB for user: ${userId}`);

                // User ma'lumotlarini olish (revokedAt tekshirish uchun)
                const user = await userService.findByTelegramId(userId, botUsername);

                // Agar revoke qilingan bo'lsa va to'lov revoke'dan oldin bo'lsa -> rad etish
                if (user?.revokedAt && paymentResult.paymentDate) {
                    if (paymentResult.paymentDate < user.revokedAt) {
                        console.log(`⚠️ [CHECK_PAYMENT] Payment is older than revoke date. Rejecting.`);

                        await ctx.editMessageText(
                            `⚠️ <b>Obunangiz bekor qilingan!</b>\n\n` +
                            `Siz qaytadan to'lov qilishingiz kerak.\n\n` +
                            `Davom etish uchun /start bosing va yangi to'lov qiling.`,
                            { parse_mode: "HTML" }
                        );
                        return;
                    }
                }

                // Yangi to'lov yoki revoke qilinmagan - tasdiqlaymiz
                await markScopedPaymentAsPaid(
                    payment,
                    userId,
                    botUsername,
                    "check_payment",
                    paymentResult.paymentDate,
                    paymentResult.payment,
                );

                console.log(`✅ [CHECK_PAYMENT] User ${userId} marked as paid`);

                // Success xabar
                await ctx.editMessageText(
                    `✅ <b>To'lovingiz tasdiqlandi!</b>\n\n` +
                    `💰 Summa: ${payment.amount} so'm\n` +
                    `🎉 Endi siz cheksiz she'rlardan bahramand bo'lishingiz mumkin!\n\n` +
                    `Davom etish uchun /start bosing.`,
                    { parse_mode: "HTML" }
                );
            } else {
                console.log(`ℹ️ [CHECK_PAYMENT] No payment found for user: ${userId}`);

                // To'lov topilmadi
                await ctx.editMessageText(
                    `⏳ <b>To'lov hali tasdiqlanmadi</b>\n\n` +
                    `💡 To'lovni amalga oshirganingizdan so'ng biroz kuting va qayta tekshiring.\n\n` +
                    `Agar to'lov qilgan bo'lsangiz va hali ham ko'rinmasa, admin bilan bog'laning.`,
                    { parse_mode: "HTML" }
                );
            }
        } catch (error) {
            console.error("❌ [CHECK_PAYMENT] Error checking payment:", error);

            await ctx.editMessageText(
                `❌ <b>Xatolik yuz berdi</b>\n\n` +
                `To'lovni tekshirishda xatolik. Iltimos qaytadan urinib ko'ring yoki admin bilan bog'laning.`,
                { parse_mode: "HTML" }
            );
        }
        return;
    }

    // Agar to'lov muvaffaqiyatsiz bo'lsa
    await ctx.answerCallbackQuery({
        text: "To'lov muvaffaqiyatsiz tugadi ❌",
        show_alert: true
    });
}

/**
 * API dan she'rlarni sinxronlash
 */
export async function syncPoemsFromAPI() {
    const poemRepo = AppDataSource.getRepository(Poem);

    try {
        const maxPages = Number(process.env.PROGRAMSOFT_PAGES) || 12;

        for (let page = 1; page <= maxPages; page++) {
            const items = await fetchPoemsFromAPI(page);

            for (const item of items) {
                const formatted = formatPoem(item);

                const existing = await poemRepo.findOne({
                    where: { externalId: formatted.externalId }
                });

                if (!existing) {
                    const poem = poemRepo.create({
                        externalId: formatted.externalId,
                        content: formatted.content,
                        author: formatted.author,
                        title: formatted.title,
                        likes: formatted.likes,
                        dislikes: formatted.dislikes
                    });
                    await poemRepo.save(poem);
                }
            }
        }

        console.log("✅ Poems synced successfully");
    } catch (error) {
        console.error("❌ Error syncing poems:", error);
    }
}

/**
 * Admin: Fon rasmini yuklash (faqat photo yuborilganda)
 */
export async function handleUploadBackground(ctx: Context) {
    const userId = ctx.from?.id;
    const adminId = Number(process.env.ADMIN_ID) || 7789445876;

    if (userId !== adminId) {
        await ctx.reply("❌ Bu buyruq faqat admin uchun!");
        return;
    }

    const photo = ctx.message?.photo;
    if (!photo || photo.length === 0) {
        await ctx.reply("❌ Iltimos rasm yuboring!");
        return;
    }

    try {
        // Eng katta o'lchamdagi rasmni olish
        const largestPhoto = photo[photo.length - 1];
        const file = await ctx.api.getFile(largestPhoto.file_id);

        if (!file.file_path) {
            throw new Error("File path not found");
        }

        // Rasmni yuklab olish
        const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        const response = await axios.get(fileUrl, {
            responseType: "arraybuffer"
        });

        // assets/background.jpg ga saqlash
        const backgroundPath = path.join(process.cwd(), "assets", "background.jpg");
        await writeFile(backgroundPath, response.data);

        await ctx.reply(
            "✅ <b>Fon rasmi muvaffaqiyatli yangilandi!</b>\n\n" +
            "📁 Fayl: assets/background.jpg\n" +
            "📏 O'lcham: " + (response.data.byteLength / 1024).toFixed(2) + " KB\n\n" +
            "Endi barcha she'rlar yangi fon bilan ko'rsatiladi! 🎨",
            { parse_mode: "HTML" }
        );
    } catch (error) {
        console.error("Error uploading background:", error);
        const errorMessage = error instanceof Error ? error.message : "Noma'lum xatolik";
        await ctx.reply("❌ Xatolik yuz berdi: " + errorMessage);
    }
}
