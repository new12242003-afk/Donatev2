const fs = require('fs');
const path = require('path');

// ค่าที่เปลี่ยนตามสภาพแวดล้อม (เครื่องตัวเอง vs เซิร์ฟเวอร์จริงบน Railway)
const ROOT = path.join(__dirname, '..');
const IS_PROD = process.env.NODE_ENV === 'production';
const flag = (name, def) => (process.env[name] === undefined || process.env[name] === '' ? def : process.env[name] === 'true');

// ข้อมูลที่ต้องอยู่รอดข้ามการ deploy (ฐานข้อมูล, ไฟล์อัปโหลด, สลิป)
// ลำดับ: DATA_DIR ที่ตั้งเอง → Volume ที่ต่อไว้บน Railway (RAILWAY_VOLUME_MOUNT_PATH ตั้งให้อัตโนมัติ) → โฟลเดอร์โปรเจกต์
// บน Railway โฟลเดอร์โปรเจกต์ถูกล้างทุกครั้งที่ deploy — ต้องมี Volume ไม่งั้นฐานข้อมูลหาย
const VOLUME = process.env.RAILWAY_VOLUME_MOUNT_PATH || '';
const ON_RAILWAY = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_PROJECT_ID);
let dataDirEnv = process.env.DATA_DIR || '';
if (dataDirEnv && VOLUME && path.resolve(dataDirEnv) !== path.resolve(VOLUME) && !path.resolve(dataDirEnv).startsWith(path.resolve(VOLUME) + path.sep)) {
  // DATA_DIR ไม่ได้อยู่บน Volume (เช่นตั้ง /data แต่ Volume mount ที่ /app/data) — ใช้ Volume แทน ข้อมูลจะได้ไม่หาย
  console.warn(`[data] DATA_DIR=${dataDirEnv} ไม่ได้อยู่บน Volume (${VOLUME}) — ใช้ ${VOLUME} แทน`);
  dataDirEnv = VOLUME;
}
if (!dataDirEnv && VOLUME) dataDirEnv = VOLUME;
const DATA_DIR = dataDirEnv ? path.resolve(dataDirEnv) : ROOT;
const UPLOAD_DIR = dataDirEnv ? path.join(DATA_DIR, 'uploads') : path.join(ROOT, 'public', 'uploads');
// ข้อมูลจะหายทุกครั้งที่ deploy ถ้ารันบน Railway โดยไม่มี Volume
const DATA_EPHEMERAL = ON_RAILWAY && !VOLUME;
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
  IS_PROD, DATA_DIR, UPLOAD_DIR, PRIVATE_DIR, DATA_EPHEMERAL, uploadDir, uploadPathFromUrl, removeUpload,
  // เติมเงินแบบจำลอง (ชำระทันที / หน้าจ่าย PromptPay จำลอง) — เปิดเป็นค่าเริ่มต้น (ยังไม่มี payment gateway จริง)
  // ⚠️ ใครก็เติม Token ฟรีได้ — ถ้าเริ่มมีการโอนเงินถอนจริง ให้ตั้ง ALLOW_MOCK_PAYMENTS=false
  ALLOW_MOCK_PAYMENTS: flag('ALLOW_MOCK_PAYMENTS', true),
  // แสดงรหัสยืนยัน/ลิงก์ยืนยันบนหน้าเว็บเมื่อยังไม่ได้ตั้งค่าอีเมล (ยืนยันอีเมลแบบจำลอง)
  // ตั้งค่า Gmail แล้วรหัสจะส่งทางอีเมลจริงอัตโนมัติ / ปิดได้ด้วย SHOW_DEV_CODES=false
  SHOW_DEV_CODES: flag('SHOW_DEV_CODES', true),
};
