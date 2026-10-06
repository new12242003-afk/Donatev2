const { db } = require('./db');
const { now } = require('./util');
const plans = require('./plans');

// การแจ้งเตือนในเว็บ (กระดิ่งบนแถบเมนู)
// dedupe_key กันแจ้งซ้ำ เช่น "แพลนใกล้หมด" ของวันหมดอายุเดียวกันแจ้งครั้งเดียว
const KEEP = 50;

// socket.io (ตั้งจาก server.js) — แจ้งเตือนใหม่เด้งขึ้นจอผู้ใช้ทันทีทุกหน้า ไม่ต้องรอกระดิ่งดึงรอบถัดไป
let io = null;
function setIo(x) { io = x; }

function add(userId, { type, title, body = '', link = '', dedupe = null }) {
  const r = db.prepare(`INSERT OR IGNORE INTO notifications (user_id, type, title, body, link, dedupe_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(userId, type, title, body, link, dedupe, now());
  // เก็บแค่รายการล่าสุด ไม่ให้ตารางโตไม่สิ้นสุด
  if (r.changes) {
    db.prepare(`DELETE FROM notifications WHERE user_id = ? AND id NOT IN
      (SELECT id FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?)`).run(userId, userId, KEEP);
    if (io) io.to('user:' + userId).emit('notify:new', { type, title, body, link });
  }
}

function donationReceived(streamerId, { display_name, amount, message, sticker, sticker_only }) {
  const what = sticker_only && sticker ? `ส่งสติกเกอร์ ${sticker.name} (${amount} บาท)` : `โดเนท ${Number(amount).toLocaleString('th-TH')} บาท`;
  add(streamerId, {
    type: 'donation',
    title: `${display_name} ${what}`,
    body: message || '',
    link: '/dashboard.html#transactions',
  });
}

// เช็คแพลนตอนดึงรายการแจ้งเตือน (ไม่ต้องมี job ตั้งเวลา): เหลือ ≤ 3 วัน, ≤ 1 วัน, หมดอายุแล้ว — อย่างละครั้งต่อวันหมดอายุ
function checkPlan(u) {
  if (u.role !== 'streamer') return;
  const s = plans.planStatus(u);
  const exp = s.expires_at;
  const left = exp - now();
  const day = 24 * 60 * 60 * 1000;
  const link = '/plans.html';
  if (!s.active) {
    add(u.id, { type: 'plan', title: 'แพลนหมดอายุแล้ว', body: 'หน้าโดเนทของคุณปิดรับโดเนทชั่วคราว ต่ออายุแพลนเพื่อเปิดรับอีกครั้ง', link, dedupe: `plan-expired:${exp}` });
  } else if (left <= day) {
    add(u.id, { type: 'plan', title: 'แพลนจะหมดอายุภายใน 24 ชั่วโมง', body: 'ต่ออายุตอนนี้ เวลาที่เหลือจะไม่หาย ระบบต่อจากวันหมดอายุเดิมให้', link, dedupe: `plan-1d:${exp}` });
  } else if (left <= 3 * day) {
    add(u.id, { type: 'plan', title: `แพลนใกล้หมดอายุ (เหลือ ${Math.floor(left / day)} วัน)`, body: 'ต่ออายุแพลนก่อนหมด เพื่อให้รับโดเนทได้ต่อเนื่อง', link, dedupe: `plan-3d:${exp}` });
  }
}

function list(u) {
  checkPlan(u);
  const items = db.prepare('SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? AND hidden = 0 ORDER BY id DESC LIMIT 30').all(u.id);
  const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND hidden = 0 AND read_at IS NULL').get(u.id).n;
  return { items, unread };
}

function markRead(userId, id) {
  if (id) db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ? AND read_at IS NULL').run(now(), userId, id);
  else db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now(), userId);
}

// ลบทั้งหมด: แถวทั่วไปลบจริง / แถวที่มี dedupe_key ซ่อนไว้ (กันแจ้งเรื่องเดิมซ้ำ)
function clearAll(userId) {
  db.prepare('DELETE FROM notifications WHERE user_id = ? AND dedupe_key IS NULL').run(userId);
  db.prepare('UPDATE notifications SET hidden = 1, read_at = COALESCE(read_at, ?) WHERE user_id = ? AND dedupe_key IS NOT NULL').run(now(), userId);
}

function payoutProcessed(p, status, note) {
  const amount = Number(p.amount).toLocaleString('th-TH');
  if (status === 'paid') {
    add(p.user_id, { type: 'payout', title: `โอนเงินถอนรายได้ ${amount} บาทแล้ว`, body: note || 'กดเพื่อดูสลิปการโอนเงิน', link: '/dashboard.html#withdrawals' });
  } else {
    add(p.user_id, { type: 'payout', title: `คำขอถอน ${amount} บาทถูกปฏิเสธ (คืนยอดเข้ารายได้แล้ว)`, body: note || '', link: '/dashboard.html#withdrawals' });
  }
}

module.exports = { setIo, add, donationReceived, payoutProcessed, list, markRead, clearAll };
