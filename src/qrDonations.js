const { db } = require('./db');
const { now } = require('./util');
const { removeUpload } = require('./config');
const slips = require('./slips');

// โดเนทผ่าน QR พร้อมเพย์ของสตรีมเมอร์ — เงินโอนตรงเข้าบัญชีสตรีมเมอร์ ไม่ผ่านเว็บ
// เว็บแค่ยืนยันจากสลิปว่าโอนจริง แล้วบันทึกโดเนท + เด้งแจ้งเตือนบน Overlay

// QR ใช้ได้ 15 นาที / ส่งสลิปได้ภายใน 24 ชม. (เผื่อโอนแล้วปิดหน้าไปก่อน)
const QR_TTL = 15 * 60 * 1000;
const SLIP_WINDOW = 24 * 60 * 60 * 1000;

function streamerTarget(u) {
  return u && u.promptpay_tag && u.promptpay_value ? { tag: u.promptpay_tag, value: u.promptpay_value } : null;
}

function viewStatus(it) {
  if (it.status === 'pending' && it.expires_at < now()) return 'expired';
  return it.status;
}

function acceptsSlip(it) {
  return it.status === 'pending' && now() - it.created_at <= SLIP_WINDOW;
}

// ยืนยันว่าเงินเข้าแล้ว → สร้างแถวใน donations (idempotent: ทำได้ครั้งเดียวต่อรายการ)
// fields.amount = ยอดที่โอนจริง (ถ้าต่างจากที่กรอกไว้) — โดเนท/แจ้งเตือนใช้ยอดนี้
// คืนแถว donation ที่สร้าง หรือ null ถ้ารายการนี้ถูกดำเนินการไปแล้ว — ผู้เรียกส่งแจ้งเตือนต่อด้วย donationAlert.deliver()
function complete(intentId, fields = {}) {
  return db.transaction(() => {
    let it = db.prepare('SELECT * FROM donation_intents WHERE id = ?').get(intentId);
    if (!it || !['pending', 'review'].includes(it.status)) return null;
    if (fields.amount && fields.amount !== it.amount) {
      db.prepare('UPDATE donation_intents SET amount = ? WHERE id = ?').run(fields.amount, it.id);
      it = { ...it, amount: fields.amount };
    }
    const info = db.prepare(`INSERT INTO donations
      (donor_user_id, streamer_user_id, amount, display_name, message, sticker_code, sticker_cost, streamer_credit, platform_fee, total_cost, voice_url, audio_url, hide_email, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?)`).run(
      it.donor_user_id, it.streamer_user_id, it.amount, it.display_name, it.message, it.sticker_code,
      it.amount, it.amount, it.voice_url, it.audio_url, it.hide_email, now());
    db.prepare(`UPDATE donation_intents SET status = 'completed', completed_at = ?, donation_id = ?,
        trans_ref = COALESCE(?, trans_ref), slip_file = COALESCE(?, slip_file), note = COALESCE(?, note)
      WHERE id = ?`).run(now(), info.lastInsertRowid, fields.trans_ref ?? null, fields.slip_file ?? null, fields.note ?? null, it.id);
    return { ...db.prepare('SELECT * FROM donations WHERE id = ?').get(info.lastInsertRowid), sticker_only: it.sticker_only };
  })();
}

// รายการที่ไม่มีใครจ่ายเกิน 2 วัน → ลบคลิปเสียงที่แนบไว้ (ไม่มีวันได้ใช้แล้ว) กันไฟล์ขยะสะสม
function cleanupStale() {
  const old = db.prepare(`SELECT id, voice_url, audio_url, slip_file FROM donation_intents
    WHERE status IN ('pending', 'rejected') AND created_at < ? AND (voice_url IS NOT NULL OR audio_url IS NOT NULL OR slip_file IS NOT NULL)`)
    .all(now() - 2 * SLIP_WINDOW);
  old.forEach((it) => {
    removeUpload(it.voice_url);
    removeUpload(it.audio_url);
    slips.removeSlip(it.slip_file);
    db.prepare('UPDATE donation_intents SET voice_url = NULL, audio_url = NULL, slip_file = NULL WHERE id = ?').run(it.id);
  });
}

module.exports = { QR_TTL, SLIP_WINDOW, streamerTarget, viewStatus, acceptsSlip, complete, cleanupStale };
