const fs = require('fs');
const path = require('path');

// ค่าที่เปลี่ยนตามสภาพแวดล้อม (เครื่องตัวเอง vs เซิร์ฟเวอร์จริงบน Railway)
const ROOT = path.join(__dirname, '..');
const IS_PROD = process.env.NODE_ENV === 'production';
const flag = (name, def) => (process.env[name] === undefined || process.env[name] === '' ? def : process.env[name] === 'true');

// ข้อมูลที่ต้องอยู่รอดข้ามการ deploy (ฐานข้อมูล, ไฟล์อัปโหลด, สลิป)
// บน Railway ให้ต่อ Volume แล้วตั้ง DATA_DIR เป็น path ของ Volume (เช่น /data) — ไม่ตั้ง = เก็บในโฟลเดอร์โปรเจกต์เหมือนเดิม
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : ROOT;
const UPLOAD_DIR = process.env.DATA_DIR ? path.join(DATA_DIR, 'uploads') : path.join(ROOT, 'public', 'uploads');
const PRIVATE_DIR = path.join(DATA_DIR, 'private');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// โฟลเดอร์ย่อยใน uploads (สร้างให้เลย)
function uploadDir(sub) {
  const d = path.join(UPLOAD_DIR, sub);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// URL "/uploads/..." → path ไฟล์จริง (null ถ้าไม่ใช่ไฟล์อัปโหลด หรือพยายามออกนอกโฟลเดอร์)
function uploadPathFromUrl(url) {
  if (!url || !String(url).startsWith('/uploads/')) return null;
  const p = path.resolve(UPLOAD_DIR, String(url).slice('/uploads/'.length));
  return p.startsWith(UPLOAD_DIR + path.sep) ? p : null;
}

function removeUpload(url) {
  const p = uploadPathFromUrl(url);
  if (p) fs.unlink(p, () => {});
}

module.exports = {
  IS_PROD, DATA_DIR, UPLOAD_DIR, PRIVATE_DIR, uploadDir, uploadPathFromUrl, removeUpload,
  // เติมเงินแบบจำลอง (ชำระทันที / หน้าจ่าย PromptPay จำลอง) — เปิดเป็นค่าเริ่มต้น (ยังไม่มี payment gateway จริง)
  // ⚠️ ใครก็เติม Token ฟรีได้ — ถ้าเริ่มมีการโอนเงินถอนจริง ให้ตั้ง ALLOW_MOCK_PAYMENTS=false
  ALLOW_MOCK_PAYMENTS: flag('ALLOW_MOCK_PAYMENTS', true),
  // แสดงรหัสยืนยัน/ลิงก์ยืนยันบนหน้าเว็บเมื่อยังไม่ได้ตั้งค่าอีเมล (ยืนยันอีเมลแบบจำลอง)
  // ตั้งค่า Gmail แล้วรหัสจะส่งทางอีเมลจริงอัตโนมัติ / ปิดได้ด้วย SHOW_DEV_CODES=false
  SHOW_DEV_CODES: flag('SHOW_DEV_CODES', true),
};
