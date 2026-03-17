# 🔗 SHERLAR DATABASE INTEGRATSIYA

## 🎯 Maqsad

Tashqi `sherlar` database'dagi to'lovlarni avtomatik tekshirish va tasdiqlash.

## 📊 Qanday ishlaydi?

### 1️⃣ **Dual Database System**

Bot **2 ta database** bilan ishlaydi:

**Asosiy DB (sevgi):**
- Bot'ning o'z ma'lumotlari
- Foydalanuvchilar
- She'rlar
- Lokal to'lovlar

**Tashqi DB (sherlar):**
- To'lovlar ro'yxati
- 1111 so'm to'lovlar
- Telegram ID bilan bog'langan

### 2️⃣ **Avtomatik Tekshirish**

Foydalanuvchi "❤️ She'rlarni o'qish" bosganda:

```
1. Lokal DB tekshiriladi (sevgi)
   ├── To'lov bormi? → ✅ 20 ta she'r
   └── To'lov yo'qmi? → 👇 2-qadamga

2. Sherlar DB tekshiriladi (tashqi)
   ├── 1111 so'm to'lov topildi?
   │   ├── ✅ Foydalanuvchi lokal DB'da "to'lagan" deb belgilanadi
   │   ├── 💬 Tasdiqlash xabari yuboriladi
   │   └── 🎉 20 ta she'r ko'rsatiladi
   └── To'lov topilmadi?
       └── 🔒 5 ta she'r (bepul)
```

### 3️⃣ **Database Konfiguratsiya**

```properties
# .env
DB_HOST=192.168.0.89
DB_PORT=5432
DB_USER=postgres
DB_PASS=123456
```

**Ikki database:**
- `sevgi` - Asosiy bot database
- `sherlar` - Tashqi to'lovlar database

### 4️⃣ **SQL Query**

Bot quyidagi query'ni ishlatadi:

```sql
SELECT COUNT(*) as count
FROM payments
WHERE telegram_id = $1
  AND amount = 1111
  AND status = 'paid'
LIMIT 1
```

**Shart:**
- ✅ `telegram_id` mos kelishi kerak
- ✅ `amount` = 1111
- ✅ `status` = 'paid'

## 🚀 Foydalanish

### Foydalanuvchi uchun:

1. Boshqa joyda 1111 so'm to'lov qiling (sherlar tizimida)
2. @sevgiSozlari_bot ga o'ting
3. `/start` bosing
4. "❤️ She'rlarni o'qish" bosing
5. ✅ Bot avtomatik to'lovni topadi va ruxsat beradi!

### Admin uchun:

```bash
# To'lovlarni ko'rish
/admin → "⏳ Kutilayotgan to'lovlar"

# Qo'lda tasdiqlash (agar kerak bo'lsa)
/approve TELEGRAM_ID
```

## 📁 Yangi Fayllar

1. **sherlar-data-source.ts**
   - Tashqi database ulanish
   - TypeORM DataSource

2. **sherlar-payment.service.ts**
   - `hasValidPayment()` - To'lov tekshirish
   - `getPaymentInfo()` - To'lov ma'lumotlari

3. **bot.handlers.ts** (yangilandi)
   - Avtomatik sherlar DB tekshiruvi
   - Auto-approval funksiyasi

4. **main.ts** (yangilandi)
   - Ikki database initialize
   - Graceful fallback

## 🔒 Xavfsizlik

- ✅ Read-only access (faqat SELECT)
- ✅ SQL injection himoyasi (parameterized queries)
- ✅ Connection pooling
- ✅ Error handling
- ✅ Fallback mechanism

## 📊 Monitoring

Terminal'da ko'rasiz:

```
🚀 Starting Anecdote Bot...
📦 Connecting to main database (sevgi)...
✅ Main database connected
📦 Connecting to sherlar database...
✅ Sherlar database connected
```

She'r ko'rganda:

```
🔍 Checking sherlar database for user: 7789445876
✅ Found payment in sherlar DB, marking user as paid
```

## ⚙️ Konfiguratsiya

### Sherlar database schema:

```sql
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookup
CREATE INDEX idx_telegram_payment 
ON payments(telegram_id, amount, status);
```

## 🎯 Advantages

1. **Avtomatik** - Qo'lda tasdiqlash kerak emas
2. **Tez** - Bir marta query, keyni cache
3. **Xavfsiz** - Read-only, SQL injection himoyasi
4. **Scalable** - Connection pooling
5. **Fallback** - Agar sherlar DB ishlamasa, lokal ishlaydi

## 🔧 Troubleshooting

**Agar sherlar DB ulanmasa:**

```
⚠️ Sherlar database connection failed (will use local payments only)
```

Bot lokal to'lovlar bilan davom etadi.

**Test qilish:**

```bash
# Sherlar DB'ni tekshirish
PGPASSWORD=123456 psql -h 192.168.0.89 -U postgres -d sherlar -c "SELECT * FROM payments WHERE amount = 1111 LIMIT 5;"
```

## ✅ Status

- ✅ Sherlar database integratsiyasi
- ✅ Avtomatik to'lov tekshiruvi
- ✅ Auto-approval
- ✅ Fallback mechanism
- ✅ Error handling
- ✅ Logging

**Bot tayyor! Tashqi to'lovlar avtomatik tan olinadi!** 🚀🔗✅
