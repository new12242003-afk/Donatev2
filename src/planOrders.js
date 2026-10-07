const { db } = require('./db');
const { now } = require('./util');
const { PROMPTPAY_ID, PROMPTPAY_NAME, PAYMENT_BANK_ACCOUNT } = require('./config');
const plans = require('./plans');
const promptpay = require('./promptpay');

// ชำระค่าแพลนด้วย QR พร้อมเพย์ของเว็บ: สร้างคำสั่งซื้อ → สแกนจ่าย → อัปโหลดสลิป → ต่ออายุแพลน
// สถานะ: pending (รอจ่าย) → review (มีสลิป รอแอดมินตรวจ) → paid / rejected

// บัญชีรับค่าแพลน: PROMPTPAY_ID ใน .env (ถ้าตั้ง) ไม่งั้นใช้ QR รับเงินของบัญชีแอดมิน
// (แอดมินตั้งเองที่แดชบอร์ด → หน้าโดเนท & QR รับเงิน) — คืน null = ยังไม่มีบัญชีรับเงิน ซื้อแพลนไม่ได้
function receiver() {
  if (PROMPTPAY_ID) {
    const target = promptpay.parseTarget(PROMPTPAY_ID);
    return target ? { target, name: PROMPTPAY_NAME, bankAccount: PAYMENT_BANK_ACCOUNT } : null;
  }
  const a = db.prepare(`SELECT promptpay_tag, promptpay_value, promptpay_name, promptpay_bank_account FROM users
    WHERE role = 'admin' AND banned = 0 AND promptpay_tag IS NOT NULL ORDER BY id LIMIT 1`).get();
  return a ? {
    target: { tag: a.promptpay_tag, value: a.promptpay_value }, name: a.promptpay_name || '', bankAccount: a.promptpay_bank_account || '',
  } : null;
}

// QR ใช้ได้ 15 นาที / ส่งสลิปได้ภายใน 24 ชม. (เผื่อโอนแล้วปิดหน้าไปก่อน / QR หมดอายุระหว่างโอน)
const QR_TTL = 15 * 60 * 1000;
const SLIP_WINDOW = 24 * 60 * 60 * 1000;

function viewStatus(o) {
  if (o.status === 'pending' && o.expires_at < now()) return 'expired';
  return o.status;
}

function acceptsSlip(o) {
  return o.status === 'pending' && now() - o.created_at <= SLIP_WINDOW;
}

// ยืนยันว่าเงินเข้าแล้ว → ต่ออายุแพลน (idempotent: ทำได้ครั้งเดียวต่อคำสั่งซื้อ)
// คืนแถวคำสั่งซื้อที่จ่ายแล้ว หรือ null ถ้าถูกดำเนินการไปแล้ว
// trans_ref ซ้ำกับรายการอื่น → โยน error ของ UNIQUE index และไม่มีอะไรเปลี่ยน
function markPaid(orderId, fields = {}) {
  return db.transaction(() => {
    const o = db.prepare('SELECT * FROM plan_orders WHERE id = ?').get(orderId);
    if (!o || !['pending', 'review'].includes(o.status)) return null;
    db.prepare(`UPDATE plan_orders SET status = 'paid', paid_at = ?,
        trans_ref = COALESCE(?, trans_ref), slip_file = COALESCE(?, slip_file), note = COALESCE(?, note)
      WHERE id = ?`).run(now(), fields.trans_ref ?? null, fields.slip_file ?? null, fields.note ?? null, o.id);
    plans.applyPurchase(o.user_id, o.plan_id, o.price);
    return db.prepare('SELECT * FROM plan_orders WHERE id = ?').get(o.id);
  })();
}

function isUniqueError(e) {
  return /UNIQUE constraint failed/i.test(String(e && e.message));
}

module.exports = { QR_TTL, SLIP_WINDOW, receiver, viewStatus, acceptsSlip, markPaid, isUniqueError };
