const fs = require('fs');
const path = require('path');

// สลิปการโอนเงินคำขอถอน — มีเลขบัญชี/ชื่อผู้รับ จึงเก็บนอกโฟลเดอร์ public
// แล้วส่งผ่าน API ที่เช็คสิทธิ์ (เจ้าของคำขอ หรือแอดมิน) เท่านั้น
const SLIP_DIR = path.join(require('./config').PRIVATE_DIR, 'slips');
fs.mkdirSync(SLIP_DIR, { recursive: true });

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

// data URL → บันทึกไฟล์ คืนชื่อไฟล์ หรือ { error }
function saveSlip(payoutId, dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return { error: 'ไฟล์สลิปต้องเป็นรูปภาพ PNG, JPG หรือ WEBP' };
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > 5 * 1024 * 1024) return { error: 'ไฟล์สลิปใหญ่เกินไป (สูงสุด 5MB)' };
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const file = `p${payoutId}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(SLIP_DIR, file), buf);
  return { file };
}

function removeSlip(file) {
  if (file && /^[\w.-]+$/.test(file)) fs.unlink(path.join(SLIP_DIR, file), () => {});
}

// ส่งไฟล์สลิปกลับ (กัน path traversal ด้วยการรับเฉพาะชื่อไฟล์ที่ระบบสร้างเอง)
function sendSlip(res, file) {
  if (!file || !/^p\d+-\d+\.(png|jpg|webp)$/.test(file)) return res.status(404).json({ error: 'ไม่พบสลิป' });
  const full = path.join(SLIP_DIR, file);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'ไม่พบสลิป' });
  res.set('Cache-Control', 'private, no-store');
  res.type(MIME[file.split('.').pop()]);
  fs.createReadStream(full).pipe(res);
}

module.exports = { saveSlip, removeSlip, sendSlip };
