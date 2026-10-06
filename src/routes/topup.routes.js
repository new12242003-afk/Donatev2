const express = require('express');
const { db, getConfig } = require('../db');
const { requireAuth, requireVerified } = require('../auth');
const ledger = require('../ledger');
const { token, now } = require('../util');
const { ALLOW_MOCK_PAYMENTS } = require('../config');
const MOCK_OFF = 'ระบบเติมเงินออนไลน์ยังไม่เปิดให้บริการ กรุณาติดต่อผู้ดูแลเว็บ';

const router = express.Router();

// QR PromptPay ใช้ได้ 15 นาที — เกินแล้วต้องสร้างรายการใหม่
const QR_TTL = 15 * 60 * 1000;

// สถานะที่หน้าเว็บเห็น: pending ที่เลยเวลาแล้วถือว่า expired (ไม่ต้องมี job มาอัปเดตแถว)
function viewStatus(tp) {
  if (tp.status === 'pending' && tp.expires_at && tp.expires_at < now()) return 'expired';
  return tp.status;
}

// ---------- จ่ายเงินจำลองจากมือถือ (สแกน QR แล้วเปิดลิงก์นี้) — ไม่ต้องล็อกอิน ใช้รหัสลับในลิงก์แทน ----------
// โหมดจำลองเท่านั้น: ตอนต่อ payment gateway จริง ให้แทนที่ด้วย webhook ของ gateway
router.post('/mock-pay/:ref', (req, res) => {
  if (!ALLOW_MOCK_PAYMENTS) return res.status(403).json({ error: MOCK_OFF });
  const tp = db.prepare('SELECT * FROM topups WHERE reference = ?').get(req.params.ref);
  if (!tp || !tp.pay_token || tp.pay_token !== String(req.body.t || '')) return res.status(404).json({ error: 'ไม่พบรายการชำระเงิน' });
  const st = viewStatus(tp);
  if (st === 'expired') return res.status(410).json({ error: 'รหัส QR หมดอายุแล้ว' });
  if (st === 'paid') return res.json({ ok: true, status: 'paid', already: true });
  creditTopup(tp.id);
  res.json({ ok: true, status: 'paid', amount_baht: tp.amount_baht });
});

router.get('/mock-pay/:ref', (req, res) => {
  const tp = db.prepare('SELECT reference, amount_baht, tokens, status, expires_at, pay_token FROM topups WHERE reference = ?').get(req.params.ref);
  if (!tp || tp.pay_token !== String(req.query.t || '')) return res.status(404).json({ error: 'ไม่พบรายการชำระเงิน' });
  res.json({ reference: tp.reference, amount_baht: tp.amount_baht, tokens: tp.tokens, status: viewStatus(tp), expires_at: tp.expires_at });
});

router.use(requireAuth);

function packages() {
  try { return JSON.parse(getConfig('topup_packages', '[20,50,100,300,500,1000]')); }
  catch { return [20, 50, 100, 300, 500, 1000]; }
}

router.get('/packages', (req, res) => res.json({ rate: 1, packages: packages() }));

// เครดิต token เข้าบัญชี (idempotent)
function creditTopup(topupId) {
  return db.transaction(() => {
    const tp = db.prepare('SELECT * FROM topups WHERE id = ?').get(topupId);
    if (!tp || tp.status === 'paid') return tp;
    db.prepare('UPDATE topups SET status = ?, paid_at = ? WHERE id = ?').run('paid', now(), tp.id);
    ledger.credit(tp.user_id, 'token_balance', tp.tokens, 'topup', 'topup', tp.id, `เติมเงิน ${tp.amount_baht} บาท`);
    return db.prepare('SELECT * FROM topups WHERE id = ?').get(tp.id);
  })();
}

router.post('/', requireVerified, (req, res) => {
  if (!ALLOW_MOCK_PAYMENTS) return res.status(403).json({ error: MOCK_OFF });
  const amount = Math.floor(Number(req.body.amount_baht));
  const method = ['mock', 'promptpay'].includes(req.body.method) ? req.body.method : 'mock';
  if (!Number.isFinite(amount) || amount < 20 || amount > 100000) {
    return res.status(400).json({ error: 'จำนวนเงินต้องอยู่ระหว่าง 20 - 100,000 บาท' });
  }

  const ref = 'TP-' + token(6).toUpperCase();
  const info = db.prepare(`INSERT INTO topups (user_id, amount_baht, tokens, method, status, reference, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)`).run(req.user.id, amount, amount, method, ref, now());

  if (method === 'mock') {
    const paid = creditTopup(info.lastInsertRowid);
    return res.json({ ok: true, status: 'paid', reference: ref, tokens: paid.tokens });
  }

  // PromptPay (จำลอง) — QR เป็นลิงก์ไปหน้าจ่ายเงินจำลอง หน้าเติมเงินเช็คสถานะเองจนกว่าจะจ่ายสำเร็จ
  const expires = now() + QR_TTL;
  const payToken = token(16);
  db.prepare('UPDATE topups SET expires_at = ?, pay_token = ? WHERE id = ?').run(expires, payToken, info.lastInsertRowid);
  res.json({
    ok: true, status: 'pending', reference: ref, expires_at: expires,
    payment: { type: 'promptpay', pay_path: `/pay/${ref}?t=${payToken}` },
  });
});

router.get('/:ref/status', (req, res) => {
  const tp = db.prepare('SELECT * FROM topups WHERE reference = ? AND user_id = ?').get(req.params.ref, req.user.id);
  if (!tp) return res.status(404).json({ error: 'ไม่พบรายการเติมเงิน' });
  res.json({ status: viewStatus(tp), tokens: tp.tokens, amount_baht: tp.amount_baht, expires_at: tp.expires_at });
});

router.get('/history', (req, res) => {
  res.json(db.prepare('SELECT * FROM topups WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id));
});

module.exports = router;
