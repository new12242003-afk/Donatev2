const express = require('express');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const { requireAuth } = require('../auth');
const { token, now } = require('../util');
const plans = require('../plans');
const promptpay = require('../promptpay');
const slips = require('../slips');
const slipVerify = require('../slipVerify');
const notify = require('../notify');
const orders = require('../planOrders');

// ซื้อ/ต่ออายุแพลน: สร้างคำสั่งซื้อ → QR พร้อมเพย์รับค่าแพลน (QR ของแอดมิน / PROMPTPAY_ID) ใส่ราคาแพลน → สแกนจ่าย → อัปโหลดสลิป
// → ตรวจกับธนาคาร: ผ่าน = ต่ออายุทันที / ไม่แน่ใจ (ยอดไม่ตรง, ระบบตรวจล่ม ...) = แอดมินตรวจเองที่หน้าแอดมิน → ชำระค่าแพลน
const OFF = 'ระบบชำระค่าแพลนยังไม่เปิดให้บริการ กรุณาติดต่อผู้ดูแลเว็บ';
const router = express.Router();
router.use(requireAuth);

router.post('/', (req, res) => {
  const rcv = orders.receiver();
  if (!rcv) return res.status(503).json({ error: OFF });
  if (req.user.role !== 'streamer') return res.status(403).json({ error: 'แพลนสำหรับบัญชีสตรีมเมอร์เท่านั้น' });
  const plan = plans.findPlan(String(req.body.plan || ''));
  if (!plan) return res.status(400).json({ error: 'ไม่พบแพลนนี้' });
  // กันสร้างรายการค้างทิ้งไว้รัว ๆ
  const open = db.prepare("SELECT COUNT(*) n FROM plan_orders WHERE user_id = ? AND status = 'pending' AND created_at > ?")
    .get(req.user.id, now() - orders.QR_TTL).n;
  if (open >= 5) return res.status(429).json({ error: 'มีรายการรอชำระหลายรายการแล้ว กรุณาชำระหรือรอให้หมดอายุก่อน' });

  const reference = 'PL-' + token(6).toUpperCase();
  const created = now();
  const expires = created + orders.QR_TTL;
  db.prepare(`INSERT INTO plan_orders (reference, user_id, plan_id, plan_label, price, promptpay_tag, promptpay_value, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(reference, req.user.id, plan.id, plan.label, plan.price, rcv.target.tag, rcv.target.value, created, expires);
  res.json({
    ok: true, reference, price: plan.price, plan_label: plan.label, expires_at: expires,
    qr: promptpay.payloadFor(rcv.target, plan.price), account_name: rcv.name, account_masked: promptpay.masked(rcv.target),
  });
});

const slipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => 'u' + req.user.id,
  message: { error: 'อัปโหลดสลิปบ่อยเกินไป กรุณารอสักครู่' },
});
const busy = new Set();

router.post('/:ref/slip', slipLimiter, async (req, res) => {
  const o = db.prepare('SELECT * FROM plan_orders WHERE reference = ? AND user_id = ?').get(req.params.ref, req.user.id);
  if (!o) return res.status(404).json({ error: 'ไม่พบรายการชำระค่าแพลน' });
  if (o.status === 'paid') return res.json({ ok: true, status: 'paid', plan: plans.planStatus(req.user) });
  if (o.status === 'review') return res.json({ ok: true, status: 'review' });
  if (!orders.acceptsSlip(o)) return res.status(400).json({ error: 'รายการนี้ไม่รับสลิปแล้ว — หากโอนเงินแล้ว กรุณาติดต่อผู้ดูแลเว็บพร้อมสลิป' });
  const img = slips.decodeSlip(req.body.slip);
  if (img.error) return res.status(400).json({ error: img.error });
  if (busy.has(o.id)) return res.status(409).json({ error: 'กำลังตรวจสลิปของรายการนี้อยู่' });

  busy.add(o.id);
  try {
    // ตรวจกับบัญชีที่ใช้ตอนสร้างคำสั่งซื้อ (รายการเก่าก่อนมีคอลัมน์นี้ = บัญชีปัจจุบัน)
    const rcv = orders.receiver();
    const target = o.promptpay_tag ? { tag: o.promptpay_tag, value: o.promptpay_value } : rcv && rcv.target;
    if (!target) return res.status(503).json({ error: OFF });
    const sameAccount = rcv && rcv.target.value === target.value;
    const v = await slipVerify.evaluate(req.body.slip, {
      amount: o.price, createdAt: o.created_at,
      forms: promptpay.receiverForms(target, sameAccount ? rcv.bankAccount : ''),
      receiverLabel: 'บัญชีพร้อมเพย์รับค่าแพลน',
      // มีระบบตรวจสลิป = ตัดสินอัตโนมัติทุกกรณี ไม่ต้องรอแอดมิน (เลขบัญชีในสลิปถูกปิด → เทียบชื่อบัญชีแทน)
      auto: slipVerify.enabled(), expectedName: sameAccount ? rcv.name : '',
    });
    if (v.kind === 'invalid' || v.kind === 'retry') return res.status(400).json({ error: v.error });
    // โหมดอัตโนมัติ: โอนไม่ครบราคาแพลน = ไม่ผ่าน (โอนเกินรับได้)
    if (v.kind === 'ok' && v.paidAmount + 0.001 < o.price) {
      return res.status(400).json({ error: `ยอดในสลิป ฿${v.paidAmount} น้อยกว่าราคาแพลน ฿${o.price} — กรุณาโอนให้ครบตาม QR` });
    }
    const reason = v.kind === 'review' ? v.reason : null;

    const saved = slips.saveSlip(o.id, req.body.slip, 'o');
    try {
      if (!reason) {
        const paid = orders.markPaid(o.id, { trans_ref: v.transRef, slip_file: saved.file, note: 'ตรวจสลิปอัตโนมัติ' });
        if (!paid) { slips.removeSlip(saved.file); return res.status(409).json({ error: 'รายการนี้ถูกดำเนินการไปแล้ว' }); }
        notify.planOrderProcessed(paid, 'paid');
        const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        return res.json({ ok: true, status: 'paid', plan: plans.planStatus(u) });
      }
      const r = db.prepare(`UPDATE plan_orders SET status = 'review', slip_file = ?, trans_ref = ?, note = ?
        WHERE id = ? AND status = 'pending'`).run(saved.file, v.transRef || null, reason, o.id);
      if (!r.changes) { slips.removeSlip(saved.file); return res.status(409).json({ error: 'รายการนี้ถูกดำเนินการไปแล้ว' }); }
    } catch (e) {
      slips.removeSlip(saved.file);
      if (orders.isUniqueError(e)) return res.status(400).json({ error: 'สลิปนี้ถูกใช้ไปแล้ว' });
      throw e;
    }
    notify.planOrderNeedsReview(o, req.user.username, reason);
    res.json({ ok: true, status: 'review' });
  } finally {
    busy.delete(o.id);
  }
});

router.get('/:ref/status', (req, res) => {
  const o = db.prepare('SELECT * FROM plan_orders WHERE reference = ? AND user_id = ?').get(req.params.ref, req.user.id);
  if (!o) return res.status(404).json({ error: 'ไม่พบรายการชำระค่าแพลน' });
  res.json({
    status: orders.viewStatus(o), price: o.price, plan_label: o.plan_label, expires_at: o.expires_at,
    accepts_slip: orders.acceptsSlip(o), note: o.status === 'rejected' ? o.note : undefined,
  });
});

module.exports = router;
