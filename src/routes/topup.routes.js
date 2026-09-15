const express = require('express');
const { db, getConfig } = require('../db');
const { requireAuth, requireVerified } = require('../auth');
const ledger = require('../ledger');
const { token, now } = require('../util');

const router = express.Router();
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

  // PromptPay (จำลอง) — ต้องกดยืนยันอีกครั้ง
  res.json({
    ok: true, status: 'pending', reference: ref,
    payment: {
      type: 'promptpay',
      qr_payload: `PROMPTPAY-MOCK|${ref}|${amount}.00`,
      note: 'สแกน QR แล้วชำระเงิน จากนั้นกด "ยืนยันการชำระ" (โหมดจำลอง)',
      confirm_url: `/api/topup/${ref}/confirm`,
    },
  });
});

router.post('/:ref/confirm', requireVerified, (req, res) => {
  const tp = db.prepare('SELECT * FROM topups WHERE reference = ? AND user_id = ?').get(req.params.ref, req.user.id);
  if (!tp) return res.status(404).json({ error: 'ไม่พบรายการเติมเงิน' });
  const paid = creditTopup(tp.id);
  res.json({ ok: true, status: 'paid', tokens: paid.tokens });
});

router.get('/history', (req, res) => {
  res.json(db.prepare('SELECT * FROM topups WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id));
});

module.exports = router;
