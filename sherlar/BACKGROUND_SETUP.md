# 🎨 Fon Rasmini O'zgartirish

Sevgi She'rlari botida fon rasmini juda oson o'zgartirishingiz mumkin!

## 📸 Usul 1: Telegram orqali (ENG OSON)

1. @sevgiSozlari_bot ga o'zingiz (admin) sifatida kiring
2. **Rasmni to'g'ridan-to'g'ri botga yuboring** (caption shart emas)
3. Bot avtomatik ravishda fon rasmini yangilaydi! ✅

**Natija:**
```
✅ Fon rasmi muvaffaqiyatli yangilandi!

📁 Fayl: assets/background.jpg
📏 O'lcham: 234.56 KB

Endi barcha she'rlar yangi fon bilan ko'rsatiladi! 🎨
```

## 📁 Usul 2: Qo'lda fayl qo'yish

1. O'zingizning rasmingizni tayyorlang
2. Uni `background.jpg` deb nomlang  
3. `assets/` papkasiga qo'ying
4. Botni qayta ishga tushiring:
   ```bash
   npm run build && npm run start:prod
   ```

## 📋 Rasm talablari:

- **Format:** JPG yoki PNG
- **Tavsiya etiladigan o'lcham:** 1080x1350 yoki katta
- **Dizayn:** Romantik, chiroyli, she'r o'qish uchun mos

## ⚙️ Qanday ishlaydi?

- Rasm yuklangandan keyin, barcha she'rlar shu rasmni fon sifatida ishlatadi
- She'r matni oq shaffof karta ustida ko'rsatiladi
- Fon rasmi biroz qorongi qilinadi (she'r yaxshi ko'rinishi uchun)
- Har bir she'r o'ziga xos dekorativ elementlar bilan bezatiladi

## 🔄 Eski rasmga qaytish

Agar yangi rasm yoqmasa:
1. Eski rasmni qayta yuklang
2. Yoki boshqa rasm yuklang

## ❗️ Muhim

- Faqat **admin** (ID: ${process.env.ADMIN_ID}) rasm yuklashi mumkin
- Agar rasm topilmasa, avtomatik gradient fon ishlatiladi
- Rasm hajmi 20MB dan kichik bo'lishi kerak (Telegram chegarasi)

## 🎨 Tavsiya

Sizning yuborgan rasmingiz (oy, sevgillar, perde, qalam, atirgul) juda go'zal! 
U she'rlar uchun judayam mos keladi! 💝
