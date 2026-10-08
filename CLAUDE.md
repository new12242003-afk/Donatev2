# CLAUDE.md

Donate Stream: เว็บรับโดเนทสำหรับสตรีมเมอร์ พร้อม Overlay แจ้งเตือนใน OBS
ผู้ชมสแกน QR พร้อมเพย์ของสตรีมเมอร์ (เงินเข้าบัญชีสตรีมเมอร์ตรง) → อัปโหลดสลิป → ระบบตรวจสลิปกับธนาคาร → แจ้งเตือนขึ้นจอ
เจ้าของโปรเจกต์สื่อสารภาษาไทย: ตอบเป็นภาษาไทย ข้อความบนเว็บและคอมเมนต์ในโค้ดก็เป็นภาษาไทย

## คำสั่ง

- `npm start`: รันเซิร์ฟเวอร์ที่ http://localhost:3000
- `npm run dev`: รันแบบ `--watch`
- ต้องใช้ Node ≥ 22.13 (ใช้ `node:sqlite` ในตัว ไม่มี native dependency)
- ไม่มี build step, linter หรือชุดเทสในรีโป ไฟล์ใน `public/` เสิร์ฟตรงตามที่เขียน

## โครงสร้าง

- `server.js`: ตั้งค่า Express, session, Socket.IO และ mount routes ทั้งหมด
- `src/config.js`: อ่านค่า env และกำหนด `DATA_DIR`, `UPLOAD_DIR`, `PRIVATE_DIR` (บน Railway ใช้ Volume ให้อัตโนมัติ)
- `src/db.js`: ฐานข้อมูล SQLite (`data.db`)
  - สร้างตารางด้วย `CREATE TABLE IF NOT EXISTS`
  - เพิ่มคอลัมน์ใหม่ด้วย `ensureColumn()` เท่านั้น ไม่มีระบบ migration แยก
  - ตาราง `config` (`getConfig` / `setConfigValue`) ใช้เก็บค่าตั้งค่าระบบ และใช้เป็นธงสำหรับ migration ที่ต้องทำครั้งเดียว
- `src/routes/*.routes.js`: API แยกตามกลุ่มผู้ใช้
  - `/auth`
  - `/api/me`
  - `/api/streamer`
  - `/api/admin`
  - `/api/qr-donate`: โดเนทผ่าน QR
  - `/api/plan-pay`: ซื้อแพลน
  - `/api/support`
  - `/api/public`
- **เงินจริง**:
  - `src/promptpay.js`: สร้าง/อ่าน payload EMVCo พร้อมเพย์ (CRC16) และสร้าง QR ที่ฝังยอดเงิน
  - `src/slipVerify.js`: ตรวจสลิปผ่าน Slip2Go (เลือกก่อน) หรือ EasySlip ฟังก์ชัน `evaluate()` เช็คเลขรายการซ้ำ, บัญชีผู้รับ, เวลาโอน และยอดเงิน
  - `src/qrDonations.js` + `src/donationAlert.js`: โดเนทผ่าน QR และยิงแจ้งเตือนไป overlay
  - `src/planOrders.js` + `src/plans.js`: ซื้อแพลน
    - ค่าแพลนโอนเข้า QR ของบัญชีแอดมิน หรือ `PROMPTPAY_ID` ถ้าตั้งไว้
    - ราคาแพลนและวันทดลองฟรีอยู่ที่ `PLANS` / `TRIAL_DAYS`
  - `src/slips.js`: เก็บไฟล์สลิปใน `PRIVATE_DIR` (ไม่ใช่ public) เพราะสลิปมีข้อมูลบัญชีของผู้โอน
- **ระบบที่ถูกลบไปแล้ว**: Token, เติมเงิน, ถอนเงิน อย่าเพิ่มกลับเข้ามา คอลัมน์เก่าอย่าง `token_balance` ยังอยู่ในฐานข้อมูลแต่ไม่ได้ใช้
- **Realtime**: Socket.IO ใช้ room `user:<id>` สำหรับแจ้งเตือนผู้ใช้ และ `stream:<id>` สำหรับ overlay ส่งข้อความผ่าน `src/notify.js`
  - room `live-watch`: หน้าสาธารณะ (หน้าสตรีมเมอร์ / หน้าโดเนท) รับ `live:update` และ `profile:update` จาก `src/live.js` แก้ข้อมูลที่ผู้ชมเห็นแล้วต้องเรียก `broadcastProfile()`
- `src/live.js`: สถานะไลฟ์ (อัตโนมัติจาก overlay ที่เปิดใน OBS หรือสตรีมเมอร์ตั้งเอง) + ตารางไลฟ์รายสัปดาห์ สถานะจาก OBS อยู่ในหน่วยความจำ รีสตาร์ทแล้ว overlay รายงานกลับมาเอง
- `src/categories.js`: หมวดหลัก หมวดย่อย ไอคอน และรูป (`public/img/categories/`) อยู่ที่นี่ที่เดียว หน้าเว็บดึงผ่าน `/api/public/categories`
- **Frontend**: HTML + vanilla JS ต่อหน้า (`public/*.html` + `public/js/*.js`)
  - ฟังก์ชันใช้ร่วมกันอยู่ใน `public/js/common.js`: `api`, `getMe`, `toast`, `confirmDialog`, `promptDialog`, `mountNav`, `onAppSocket`
  - `public/overlay.html` เป็นหน้าแบบ standalone ที่โหลดใน OBS Browser Source
- **CSS**: ทุกหน้าใช้ไฟล์เดียว `public/css/app.css`
  - ธีมน้ำเงินดำ มีโหมดมืด/สว่าง ใช้ตัวแปร `--metal-*`
  - `--text-scale` ใช้ขยายตัวอักษรทั้งเว็บ
  - ส่วนธีมที่เพิ่มทีหลังอยู่ท้ายไฟล์

## ข้อควรระวัง

- **ตรรกะเดียวกันอยู่สองที่**: `speechText()` (ประโยคที่อ่านออกเสียง) อยู่ทั้งใน `src/tts.js` (เสียง AI) และ `public/overlay.html` (เสียงเบราว์เซอร์) แก้ที่หนึ่งต้องแก้อีกที่ให้ตรงกัน
- **เปลี่ยนค่าเริ่มต้นที่กระทบผู้ใช้เดิม**: ต้องปกป้องข้อมูลเดิม ตัวอย่างคือตอนลดวันทดลองฟรีจาก 21 เหลือ 14 วัน มีธง `trial_14_migrated` ใน `src/plans.js` ที่ทำให้บัญชีเดิมยังได้ 21 วัน
- **แก้รายการหมวดหมู่ใน `src/categories.js`**: ผู้ใช้เก็บชื่อหมวดเป็นข้อความ
  - ลบหมวดย่อย: ลบจากรายการได้เลย ตอนเปิดเซิร์ฟเวอร์ระบบล้างออกจากข้อมูลผู้ใช้ให้
  - เปลี่ยนชื่อหรือรวมหมวดย่อย: ใส่คู่ชื่อเดิม → ชื่อใหม่ใน `SUB_RENAMES` ไม่อย่างนั้นคนที่เลือกไว้จะหายจากหมวดนั้น
  - เปลี่ยนชื่อหมวดหลัก: ต้องเขียน migration ครั้งเดียวพร้อมธงแบบ `categories_twitch_migrated`
- **`data.db` เป็นข้อมูลผู้ใช้จริง**: อย่าแก้ อย่าคัดลอก อย่าใช้ทดสอบ ถ้าจะทดสอบให้ตั้ง `DATA_DIR` เป็นโฟลเดอร์ชั่วคราว แล้ว `require('./server.js')` ด้วย `PORT=0` หรือพอร์ตอื่น
- **โควตา Slip2Go เสียเงินจริง**: ตอนทดสอบให้ตั้ง `SLIP2GO_API_KEY` เป็นค่าว่างหรือค่าปลอม และ mock `global.fetch` สำหรับโดเมน `slip2go.com` / `easyslip.com`
- **ความลับอยู่ใน `.env` เท่านั้น** (อยู่ใน gitignore แล้ว): อย่าใส่ key หรือรหัสผ่านลงในโค้ด README หรือ commit
- **แก้ไฟล์ใน `src/` แล้วต้องรีสตาร์ทเซิร์ฟเวอร์** บน Windows ให้เช็คว่าไม่มี node process ตัวเก่าค้างพอร์ต 3000 อยู่ ถ้ามีให้ปิดก่อน ไม่อย่างนั้นจะยังเสิร์ฟโค้ดเก่า (ตรวจด้วย `Get-NetTCPConnection -LocalPort 3000`)
- **เปลี่ยนไฟล์รูป/asset ที่ชื่อเดิม**: เติม `?v=N` ใน HTML กันเบราว์เซอร์ใช้ cache เก่า
- **Deploy**: ใช้ Railway + Volume เท่านั้น (ขั้นตอนอยู่ใน README) ใช้ Vercel/serverless ไม่ได้ เพราะต้องมีไฟล์ SQLite, ไฟล์อัปโหลด และ Socket.IO ที่เชื่อมต่อค้างไว้
