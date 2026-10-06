const { db } = require('./db');

// คืน tier ที่ยอดเงินสูงสุดที่ amount ยังเข้าเงื่อนไข (amount >= min_amount) — ใช้ override
// สวิตช์ TTS/เสียง/GIF ของ "แจ้งเตือนที่กำหนดเองตามจำนวนเงินที่ได้รับ" ยอดสูงมีสิทธิ์เหนือยอดต่ำ
function getActiveTier(userId, amount) {
  const tiers = db.prepare('SELECT * FROM notification_tiers WHERE user_id = ? AND min_amount <= ? ORDER BY min_amount DESC LIMIT 1')
    .all(userId, amount);
  return tiers[0] || null;
}

module.exports = { getActiveTier };
