# ValyutaKursi Bot

Telegram valyuta kursi boti. Stack: Node.js, TypeScript, [grammy](https://grammy.dev), PostgreSQL, TypeORM.

## Tez start

1. `cp .env.example .env` va `.env` ichiga `BOT_TOKEN` hamda DB rekvizitlarini yozing.
2. `npm install`
3. `npm run dev` (yoki `npm run build && npm start` prod uchun).

## Muhit o'zgaruvchilari

- `BOT_TOKEN` - Telegram bot token.
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` - PostgreSQL ulanish ma'lumotlari.
- `SHERLAR_DB_HOST`, `SHERLAR_DB_PORT`, `SHERLAR_DB_USERNAME`, `SHERLAR_DB_PASSWORD`, `SHERLAR_DB_NAME` - tashqi sherlar DB (ixtiyoriy, to'lovni tekshirish uchun).
- `RATE_API_URL` - valyuta API endpointi (`http://94.158.52.192/kurs/test.php`).
- `PRO_PAYMENT_URL` - PRO obuna uchun to'lov sahifasi URL'i.
- `PRO_PRICE` - PRO obuna narxi (so'm).
- `PRO_DURATION_DAYS` - PRO muddati (kun). 0 yoki manfiy bo'lsa cheksiz.
- `CLICK_SERVICE_ID` - Click servis ID (direct Click integratsiya uchun).
- `CLICK_MERCHANT_ID` - Click merchant ID (direct Click integratsiya uchun).
- `CLICK_SECRET_KEY` - Click secret key (direct Click integratsiya uchun).
- `CLICK_RETURN_URL` - Click to'lovdan keyin qaytish URL'i.
- `CLICK_RETURN_URL_WHITELIST` - return_url uchun ruxsat berilgan ro'yxat (vergul bilan).
- `CLICK_IP_ALLOWLIST` - Click webhook IP allowlist (vergul bilan, ixtiyoriy).
- `CLICK_BASE_URL` - Click to'lov URL bazasi (`https://my.click.uz/services/pay`).
- `APP_BASE_URL` - serveringizning public URL'i (masalan: `https://yourdomain.uz`).
- `PAYMENT_TTL_MINUTES` - tx amal qilish muddati (minut), default: 20.
- `PAYMENT_LINK_MODE` - `tx-only` (default, xavfsiz) yoki `legacy` (eski gateway link).
- `LEGACY_WEBHOOK_TOKEN` - `/webhook/pay` uchun maxfiy token (x-webhook-token yoki Bearer).
- `WEBHOOK_PORT` - Click webhook server porti (default: 3000).
- `ALERT_CHECK_INTERVAL_MS` - kurs alertlarini tekshirish oraliqi (ms).
- `ADMIN_IDS` - admin Telegram ID'lar (vergul bilan ajratib yozing).

## Click webhook

Click server webhook manzili:
- `POST /webhook/pay` — oddiy gateway payload (`tx`, `status`, `amount`, `user_id`).
- `POST /webhook/click` (yoki `POST /api/click`) — Click PREPARE/COMPLETE payload (CLICK_* envlar sozlangan bo'lsa).
- `GET /pay?tx=...` — xavfsiz redirect: tx bo'yicha DB'dan amount va return_url olinadi.

## Arxitektura qisqacha

- `src/index.ts` - kirish nuqtasi, DB ni ishga tushiradi va botni start qiladi.
- `src/bot/bot.ts` - komandalar va callbacklar.
- `src/database/data-source.ts` - TypeORM DataSource konfiguratsiyasi.
- `src/entities` - TypeORM entitetlari (`User`, `CurrencyRate`).
- `src/services/currencyService.ts` - kurs bilan ishlash logikasi (CRUD, API dan pull qilish).

Bot start bo'lganda `RATE_API_URL` dan kurslarni olib `UZS` ga nisbatan DB ga saqlab qo'yadi.

Botdagi asosiy buyruqlar:
- `/rate USD [UZS]` — juftlik kursi (UZS default).
- `/convert 100 USD UZS` — miqdorni konvertatsiya qilish (default: 100 USD ➝ UZS, natija bayroq + so'm formatida ko'rinadi).
- `/rates` — bazadagi barcha kurslar ro'yxati.
- `/help` — qisqa yordam.

> Eslatma: `synchronize: true` dev uchun yoqilgan. Prodga chiqishda migratsiyaga o'tkazing.
