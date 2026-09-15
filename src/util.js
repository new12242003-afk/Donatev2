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

module.exports = { token, now, clean, clampInt };
