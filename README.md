# Donate Stream

เว็บไซต์โดเนทสำหรับสตรีมเมอร์ (Node.js + Express + Socket.IO)
ฐานข้อมูลใช้ `node:sqlite` ที่มากับ Node.js — **ไม่ต้องคอมไพล์ native module ใด ๆ**
พร้อมระบบสมาชิก ยืนยันอีเมล โดเนทผ่าน QR พร้อมเพย์ของสตรีมเมอร์ (ตรวจสลิปอัตโนมัติ) พร้อมสติกเกอร์ และ **Overlay สำหรับ OBS Studio**

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

1. **แอดมิน** — `/admin.html` : จัดการผู้ใช้ (เปลี่ยนบทบาท/ระงับ/รีเซ็ตรหัส), จัดการสติกเกอร์,
   ตั้งค่าระบบ (ชื่อเว็บ, ยอดโดเนทขั้นต่ำ/สูงสุด), ตรวจสลิปค่าแพลนที่ระบบตรวจอัตโนมัติไม่ผ่าน, ดูโดเนททั้งหมด
2. **สตรีมเมอร์** — `/dashboard.html` : รับ URL Overlay สำหรับ OBS, ปรับแต่งการแจ้งเตือน (สี/เวลา/ขั้นต่ำ/เสียง/TTS/ข้อความหัวข้อ),
   ตั้ง QR พร้อมเพย์รับโดเนท, ทดสอบแจ้งเตือน, ดูโดเนทที่ได้รับ, ซื้อ/ต่ออายุแพลน (`/plans.html`)
3. **ผู้ชม** — หน้าโดเนท `/u/:username` (ไม่ต้องล็อกอิน): ใส่ยอด/ข้อความ/สติกเกอร์ → สแกน QR พร้อมเพย์ของสตรีมเมอร์ → อัปโหลดสลิป · ล็อกอินแล้วดูประวัติการโดเนทในแดชบอร์ด

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

เว็บไม่ถือเงินแทนใคร — ไม่มี Token / เติมเงิน / ถอนเงิน

- **โดเนท = โอนตรงเข้าบัญชีพร้อมเพย์ของสตรีมเมอร์** (`src/qrDonations.js`, `src/routes/qrdonate.routes.js`)
  - สตรีมเมอร์อัปโหลดรูป QR รับเงินจากแอปธนาคารในแดชบอร์ด → หน้าเว็บอ่าน QR (jsQR) → เก็บหมายเลขพร้อมเพย์ (`users.promptpay_*`)
  - ผู้ชมสร้างรายการ (`donation_intents`) → ได้ QR ใส่ยอดโดเนท → โอน → อัปโหลดสลิป
  - ตรวจด้วย Slip2Go / EasySlip (`SLIP2GO_API_KEY` / `EASYSLIP_API_KEY` ของเว็บ): ระบบตัดสินเองทุกกรณี ผ่าน = สร้างแถวใน `donations` + เด้งแจ้งเตือนบน OBS ทันที / ไม่ผ่าน = แจ้งเหตุผลให้ผู้ชมส่งสลิปใหม่
  - ยังไม่ตั้ง key = สตรีมเมอร์ยืนยันเองที่แดชบอร์ด → หน้าโดเนท & QR รับเงิน
- **ค่าแพลน = QR รับเงินของบัญชีแอดมิน** (ตั้งที่แดชบอร์ดแอดมิน → หน้าโดเนท & QR รับเงิน; ตั้ง `PROMPTPAY_ID` เพื่อใช้บัญชีอื่นแทน) (`src/planOrders.js`, `src/routes/planpay.routes.js`)
  - หน้าแพลน → เลือกแพลน → QR ใส่ราคาแพลน → อัปโหลดสลิป → ตรวจผ่าน = ต่ออายุแพลนทันที (`plans.applyPurchase()`)
  - ตัดสินอัตโนมัติทุกกรณีเหมือนสลิปโดเนท (โอนไม่ครบ/เข้าบัญชีอื่น/สลิปซ้ำ = ไม่ผ่าน, ระบบตรวจล่ม = ให้ลองใหม่) · ยังไม่ตั้ง key ตรวจสลิป = แอดมินอนุมัติเองที่หน้าแอดมิน → ชำระค่าแพลน
- 1 สลิปใช้ได้ครั้งเดียวทั้งเว็บ (`trans_ref` เป็น UNIQUE + `slipVerify.refUsed()` เช็คทุกตาราง)
- ตาราง `topups`, `payouts`, `transactions` และคอลัมน์ `token_balance` / `earnings_balance` ของระบบเดิมเก็บไว้เป็นประวัติ ไม่มีโค้ดเขียนเพิ่มแล้ว

## โครงสร้าง

```
server.js              จุดเริ่ม + Express + Socket.IO
src/db.js              schema + seed (node:sqlite) + ตัวห่อ transaction()
src/auth.js            middleware: requireAuth / requireVerified / requireRole
src/mailer.js          ส่งอีเมลยืนยัน (Gmail / SMTP / โหมด dev)
src/google.js          passport-google-oauth20 (เปิดเมื่อมี env)
src/promptpay.js       สร้าง/อ่าน QR พร้อมเพย์ (EMVCo)
src/slipVerify.js      ตรวจสลิปกับธนาคาร (Slip2Go / EasySlip) + เช็คผู้รับ/ยอด/เวลา/สลิปซ้ำ
src/sessionStore.js    เก็บ session ผู้ใช้ในตาราง sessions ของ data.db (แทน memory)
src/routes/*.js        auth, user, qrdonate, planpay, donate, streamer, admin, public, support
public/                หน้าเว็บ (vanilla JS) + overlay.html สำหรับ OBS
data.db                ฐานข้อมูล SQLite (สร้างอัตโนมัติ)
```

## หมายเหตุ production

- เปลี่ยน `SESSION_SECRET`, ตั้ง `COOKIE_SECURE=true` เมื่อใช้ HTTPS (ถ้าตั้ง `NODE_ENV=production` แล้วลืมตั้ง `SESSION_SECRET` ระบบจะเตือนใน log ตอนสตาร์ท)
- session เก็บอยู่ในตาราง `sessions` ของ `data.db` แล้ว (ผ่าน `src/sessionStore.js`) ไม่ใช่ memory เหมือนก่อน — รอดจาก restart/deploy ได้โดยไม่ต้องเพิ่ม native dependency
- ตรวจโควตา/วันหมดอายุแพ็กเกจตรวจสลิป (Slip2Go/EasySlip) — หมดเมื่อไรผู้ชมทุกคนส่งสลิปโดเนทไม่ผ่านจนกว่าจะเติม
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

> **ตั้งค่าเงินจริง:** `SLIP2GO_API_KEY` (หรือ `EASYSLIP_API_KEY`) สำหรับตรวจสลิป และ `PROMPTPAY_ID` / `PROMPTPAY_NAME` / `PAYMENT_BANK_ACCOUNT` สำหรับรับค่าแพลน
>
> - ยืนยันอีเมลจำลอง — ถ้ายังไม่ตั้งค่า Gmail รหัสยืนยันจะแสดงบนหน้าเว็บ (ตั้ง Gmail แล้วส่งทางอีเมลจริงอัตโนมัติ) ปิดด้วย `SHOW_DEV_CODES=false`
