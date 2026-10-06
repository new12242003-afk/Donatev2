const crypto = require('crypto');

function token(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function now() {
  return Date.now();
}

// ตัดอักขระที่อาจใช้ inject markup และจำกัดความยาว
function clean(str, max = 200) {
  return String(str == null ? '' : str).replace(/[<>]/g, '').trim().slice(0, max);
}

function clampInt(v, min, max, def) {
  v = Math.floor(Number(v));
  if (!Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, v));
}

// สร้างข้อความหัวข้อแจ้งเตือนแบบ plain text (ใช้เป็น fallback เวลา client render แบบแยกสีไม่ได้)
// {currency} คือจุดที่ควรใส่สัญลักษณ์เงิน ส่วน regex ท้ายสุดช่วยลบ ฿ ที่เทมเพลตเก่าฝังเป็นตัวอักษรตายตัวไว้ (ไม่ได้ใช้ {currency})
function buildTitle(template, display_name, amount, showCurrency) {
  const currency = showCurrency ? '฿' : '';
  let title = String(template || '{name} โดเนท {amount}{currency}')
    .replace('{name}', display_name).replace('{amount}', amount).replace('{currency}', currency);
  if (!showCurrency) title = title.replace(/฿/g, '');
  return title;
}

// ยอดต่ำกว่าเกณฑ์ขั้นต่ำของ TTS (ถ้าเปิดใช้เกณฑ์นี้ไว้) ให้ใช้เสียง Sound แทน แม้ TTS จะเปิดอยู่ก็ตาม
function resolveTts(st, baseTtsEnabled, amount) {
  if (!baseTtsEnabled) return false;
  if (st.tts_min_amount_enabled && amount < (st.tts_min_amount || 1)) return false;
  return true;
}

module.exports = { token, now, clean, clampInt, buildTitle, resolveTts };
