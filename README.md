# Donate Stream

เว็บไซต์โดเนทสำหรับสตรีมเมอร์ (Node.js + Express + Socket.IO)
ฐานข้อมูลใช้ `node:sqlite` ที่มากับ Node.js — **ไม่ต้องคอมไพล์ native module ใด ๆ**
พร้อมระบบสมาชิก ยืนยันอีเมล เติมเงิน โดเนทพร้อมสติกเกอร์ และ **Overlay สำหรับ OBS Studio**

## ติดตั้ง

```bash
cd d:\Donate
npm install
copy .env.example .env      # แล้วแก้ค่าใน .env
npm start
```

เปิด http://localhost:3000

> ต้องใช้ Node.js เวอร์ชัน 22.13 ขึ้นไป (ใช้โมดูลในตัว `node:sqlite`)
> dependencies ทั้งหมดเป็น pure JavaScript ไม่ต้องมี Python / Visual Studio Build Tools

## บัญชีเริ่มต้น

| บทบาท | username | password |
|-------|----------|----------|
| แอดมิน | `admin` | `admin123` (บนเครื่องตัวเอง) — บนเว็บจริงใช้ `ADMIN_PASSWORD` หรือดูรหัสที่สุ่มให้ใน log ครั้งแรก |

## 3 บทบาทผู้ใช้งาน

1. **แอดมิน** — `/admin.html` : จัดการผู้ใช้ (เปลี่ยนบทบาท/ระงับ/ปรับยอด/รีเซ็ตรหัส), จัดการสติกเกอร์,
   ตั้งค่าระบบ (ชื่อเว็บ, ค่าธรรมเนียม, แพ็กเกจเติมเงิน), อนุมัติคำขอถอนเงิน, ดูโดเนท/เติมเงินทั้งหมด
2. **สตรีมเมอร์** — `/dashboard.html` : รับ URL Overlay สำหรับ OBS, ปรับแต่งการแจ้งเตือน (สี/เวลา/ขั้นต่ำ/เสียง/TTS/ข้อความหัวข้อ),
   ทดสอบแจ้งเตือน, ดูโดเนทที่ได้รับ, ขอถอนเงิน
3. **ผู้โดเนท** — `/dashboard.html` : เติมเงิน (20 บาท = 20 Token), ส่งโดเนทพร้อมชื่อ/ข้อความ/สติกเกอร์, ดูประวัติ

ผู้โดเนทกดปุ่ม "อัปเกรดเป็นสตรีมเมอร์" เองได้จากแดชบอร์ด

## การยืนยันอีเมล (Google/Gmail)

- ตั้งค่า `GMAIL_USER` + `GMAIL_APP_PASSWORD` ใน `.env` เพื่อส่งลิงก์ยืนยันจริง
- ถ้าไม่ตั้งค่า ระบบจะแสดง "ลิงก์ยืนยัน" บนหน้าเว็บ/คอนโซลให้กดทดสอบได้ทันที
- เข้าสู่ระบบด้วย Google: ตั้ง `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
  (redirect URI: `http://localhost:3000/auth/google/callback`) ผู้ใช้ Google จะถือว่ายืนยันอีเมลแล้ว

## เชื่อมต่อ OBS Studio

1. เข้าสู่ระบบเป็นสตรีมเมอร์ → แดชบอร์ด → ส่วน "Overlay สำหรับ OBS Studio" → คัดลอก URL
2. ใน OBS: **Sources → + → Browser**
3. วาง URL, ตั้ง Width `1920`, Height `1080`, ติ๊ก *Shutdown source when not visible* ได้
4. กด "ส่งทดสอบ" ในแดชบอร์ด จะเห็นการแจ้งเตือน + สติกเกอร์เด้งขึ้นบน Source ทันที
5. เมื่อมีคนโดเนท ระบบจะ push ผ่าน Socket.IO ไปที่ Overlay แบบเรียลไทม์

หากสงสัยว่า URL รั่ว กด "สร้าง URL ใหม่" เพื่อยกเลิกอันเก่า

## ระบบเงิน

- `token_balance` = ยอดของผู้โดเนท (1 Token = 1 บาท) เติมผ่านหน้า "เติมเงิน"
  - `mock` = เครดิตทันที (สำหรับทดสอบ)
  - `promptpay` = สร้างรายการค้างไว้ แล้วกด "ยืนยันการชำระ" (จำลอง QR)
  - **จุดต่อ payment gateway จริง**: `src/routes/topup.routes.js` ฟังก์ชัน `creditTopup()` — เรียกหลังจาก webhook ของผู้ให้บริการยืนยันการชำระ
- โดเนท = หัก `amount + ค่าสติกเกอร์` จากผู้โดเนท, เข้ารายได้สตรีมเมอร์ (หัก `platform_fee_percent` ถ้าตั้งไว้)
- ทุกการเคลื่อนไหวบันทึกในตาราง `transactions` (ledger)
- ถอนเงิน = สร้างคำขอในตาราง `payouts` (แอดมินกด "จ่ายแล้ว" หรือ "ปฏิเสธ" เพื่อคืนยอด)

## โครงสร้าง

```
server.js              จุดเริ่ม + Express + Socket.IO
src/db.js              schema + seed (node:sqlite) + ตัวห่อ transaction()
src/auth.js            middleware: requireAuth / requireVerified / requireRole
src/mailer.js          ส่งอีเมลยืนยัน (Gmail / SMTP / โหมด dev)
src/google.js          passport-google-oauth20 (เปิดเมื่อมี env)
src/ledger.js          credit() / debit() / transfer() — จุดเดียวที่แก้ยอดเงินผู้ใช้ + บันทึก ledger ทั้งเว็บ
src/sessionStore.js    เก็บ session ผู้ใช้ในตาราง sessions ของ data.db (แทน memory)
src/routes/*.js        auth, user, topup, donate, streamer, admin, public
public/                หน้าเว็บ (vanilla JS) + overlay.html สำหรับ OBS
data.db                ฐานข้อมูล SQLite (สร้างอัตโนมัติ)
```

## หมายเหตุ production

- เปลี่ยน `SESSION_SECRET`, ตั้ง `COOKIE_SECURE=true` เมื่อใช้ HTTPS (ถ้าตั้ง `NODE_ENV=production` แล้วลืมตั้ง `SESSION_SECRET` ระบบจะเตือนใน log ตอนสตาร์ท)
- session เก็บอยู่ในตาราง `sessions` ของ `data.db` แล้ว (ผ่าน `src/sessionStore.js`) ไม่ใช่ memory เหมือนก่อน — รอดจาก restart/deploy ได้โดยไม่ต้องเพิ่ม native dependency
- ต่อ payment gateway จริงแทนโหมดจำลอง — จุดเชื่อมคือ `creditTopup()` ใน `src/routes/topup.routes.js` ซึ่งตอนนี้เรียกผ่าน `src/ledger.js` (จุดกลางที่รวมตรรกะเพิ่ม/หักยอดเงินทั้งหมดของเว็บไว้ที่เดียว)
- พิจารณา rate-limit เพิ่มเติมและ CAPTCHA ที่หน้า register

## Deploy ขึ้น Railway

1. Push โปรเจกต์ขึ้น GitHub แล้วที่ [railway.com](https://railway.com) กด **New Project → Deploy from GitHub repo** เลือก repo นี้
   (Railway อ่าน `package.json` แล้วรัน `npm start` ให้เอง)
2. **เพิ่ม Volume** (สำคัญมาก) — คลิกขวาที่ service → **Attach Volume** ตั้ง Mount path เป็น `/data`
   ไม่มี Volume = ฐานข้อมูลและรูปที่อัปโหลดหายทุกครั้งที่ deploy ใหม่
3. ตั้งค่า **Variables** ของ service:

   | ตัวแปร | ค่า |
   |--------|-----|
   | `NODE_ENV` | `production` |
   | `DATA_DIR` | `/data` (ตรงกับ Mount path ของ Volume) |
   | `SESSION_SECRET` | สตริงสุ่มยาว ๆ (เช่นผลจาก `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
   | `BASE_URL` | URL ของเว็บ เช่น `https://xxx.up.railway.app` (ไม่มี / ท้าย) |
   | `ADMIN_PASSWORD` | รหัสผ่านแอดมินตอนสร้างครั้งแรก |
   | `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_FROM` | จำเป็นสำหรับสมัครสมาชิก/ลืมรหัสผ่าน (ส่งรหัสยืนยันทางอีเมล) |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | ไม่บังคับ — เข้าสู่ระบบด้วย Google (redirect URI = `BASE_URL/auth/google/callback`) |
   | `GOOGLE_TTS_API_KEY` | ไม่บังคับ — AI เสียงอ่านข้อความโดเนท |

   ไม่ต้องตั้ง `PORT` — Railway กำหนดให้เอง
4. **Settings → Networking → Generate Domain** เพื่อได้ URL สาธารณะ แล้วนำไปใส่ `BASE_URL`
5. (แนะนำ) **Settings → Deploy → Healthcheck Path** = `/healthz`

> โหมด production จะ **ปิดการเติมเงินจำลอง** (ยังไม่มี payment gateway จริง) — แอดมินปรับยอด Token ให้ผู้ใช้ได้จากหน้าแอดมิน
> ถ้าต้องการเปิดเพื่อทดลองระบบ ตั้ง `ALLOW_MOCK_PAYMENTS=true` (อย่าเปิดถ้ามีการถอนเงินจริง)
