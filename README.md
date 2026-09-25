# 🧣 Ro'mol Ishlab Chiqarish Mini-ERP (Boltshift UI/UX & BoM)

Ro'mol ishlab chiqarish sexi uchun maxsus moslashtirilgan sanoat darajasidagi mini-ERP web-ilovasi.

---

## 📌 Asosiy Imkoniyatlar va Yangiliklar

1. **Rulonlar Monitoringi (Roll Tracker Sidebari):**
   - Konveyer bo'limining chap tomonida barcha ochilgan faol rulonlar ro'yxati joylashgan.
   - Har bir rulon qaysi bosqichda va qaysi usta qo'lida turgani, qancha metri kesilib, nechta ro'molga aylangani doimiy ko'rinib turadi.
   - Rulon kartasi bosilganda konveyerdagi tegishli partiya ajralib ko'rinadi.

2. **Mahsulot BoM (Bill of Materials / Retseptlar):**
   - Har bir ro'mol modelining texnologik retseptini kiritish va tahrirlash:
     - **Rulon normasi:** Eni keng rulondan 1 pogon metrda nechta ro'mol chiqishi (masalan, `1 metr ➔ 3 ta ro'mol`, ya'ni 1 dona ro'mol = 0.33m).
     - **Tosh normasi:** 1 dona ro'molga sarflanadigan tosh soni (masalan, `25 dona` yoki toshsiz bo'lsa `0`).
     - **Tikuv ipi:** Taxminiy sarf normasi (`0.02 bobina`).
     - **Etiketka va Salafan paketi:** Donali sarf me'yori.

3. **7 Bosqichli Haqiqiy Texnologik Konveyer:**
   - ✂️ **1. Bichuv:** Rulon metraj bo'yicha kesiladi.
   - 📐 **2. Donalash:** Kesilgan polotno 3 ta to'rtburchak ro'molga ajratiladi.
   - 🪡 **3. Tikish:** Yonlari overlog qilinadi (ip sarfi yechiladi).
   - ✨ **4. Tosh:** Termopressda tosh yopishtiriladi (tosh sarfi yechiladi; toshsiz bo'lsa avtomatik o'tkazib yuboriladi).
   - 💨 **5. Dazmol:** Bug'li dazmoldan o'tadi va sifat nazorati qilinadi.
   - 🏷️ **6. Etiketka:** Brend to'qima etiketkasi qadaladi.
   - 📦 **7. Salafan & Tayyor Ombor:** Salafan paketga solinadi va tayyor ombor astatkasiga qabul qilinadi.

4. **Ombor Astatkalari (Zaxiralar):**
   - Rulon matolar (metrda), toshlar (dona), iplar (bobina), etiketkalar va salafanlar.
   - Minimal chegaradan oz qolgan xomashyolar haqida darhol ogohlantirish.

---

## 🚀 Ishga Tushirish

Server fonda `http://localhost:3000` manzilida ishlamoqda.
Istalgan vaqtda brauzerda [http://localhost:3000](http://localhost:3000) manziliga kirib foydalanishingiz mumkin.
