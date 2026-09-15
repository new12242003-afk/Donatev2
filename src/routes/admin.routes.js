const express = require('express');
const bcrypt = require('bcryptjs');
const { db, setConfigValue } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { addLedger } = require('../wallet');
const { now, clean, token } = require('../util');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/stats', (req, res) => {
  const users = db.prepare('SELECT role, COUNT(*) c FROM users GROUP BY role').all();
  const donations = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(total_cost),0) v FROM donations').get();
  const tp = db.prepare("SELECT COALESCE(SUM(amount_baht),0) v FROM topups WHERE status = 'paid'").get();
  const pend = db.prepare("SELECT COUNT(*) c FROM payouts WHERE status = 'pending'").get();
  res.json({ users, donations, topup_total: tp.v, pending_payouts: pend.c });
});

// ---------- users ----------
router.get('/users', (req, res) => {
  const q = '%' + String(req.query.q || '').toLowerCase() + '%';
  res.json(db.prepare(`SELECT id, username, email, role, display_name, email_verified,
      token_balance, earnings_balance, overlay_key, banned, created_at
    FROM users
    WHERE lower(username) LIKE ? OR lower(IFNULL(email,'')) LIKE ?
    ORDER BY id DESC LIMIT 200`).all(q, q));
});

router.patch('/users/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  const b = req.body;
  const role = ['admin', 'streamer', 'donor'].includes(b.role) ? b.role : u.role;
  const banned = b.banned !== undefined ? (b.banned ? 1 : 0) : u.banned;
  const email_verified = b.email_verified !== undefined ? (b.email_verified ? 1 : 0) : u.email_verified;
  const display_name = b.display_name !== undefined ? clean(b.display_name, 40) : u.display_name;

  let overlay_key = u.overlay_key;
  if (role === 'streamer' && !overlay_key) {
    overlay_key = token(20);
    db.prepare('INSERT OR IGNORE INTO streamer_settings (user_id, updated_at) VALUES (?, ?)').run(u.id, now());
  }
  db.prepare('UPDATE users SET role=?, banned=?, email_verified=?, display_name=?, overlay_key=? WHERE id=?')
    .run(role, banned, email_verified, display_name, overlay_key, u.id);
  res.json({ ok: true });
});

router.post('/users/:id/adjust', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  const field = ['token_balance', 'earnings_balance'].includes(req.body.field) ? req.body.field : null;
  const delta = Math.floor(Number(req.body.delta));
  if (!field || !Number.isFinite(delta)) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });

  db.prepare(`UPDATE users SET ${field} = ${field} + ? WHERE id = ?`).run(delta, u.id);
  const bal = db.prepare(`SELECT ${field} v FROM users WHERE id = ?`).get(u.id).v;
  addLedger(u.id, 'admin_adjust', delta, bal, 'admin', req.user.id, clean(req.body.note || 'ปรับยอดโดยแอดมิน', 100));
  res.json({ ok: true, balance: bal });
});

router.post('/users/:id/reset-password', (req, res) => {
  const np = String(req.body.password || '');
  if (np.length < 6) return res.status(400).json({ error: 'รหัสผ่านอย่างน้อย 6 ตัว' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(np, 10), req.params.id);
  res.json({ ok: true });
});

// ---------- stickers ----------
router.get('/stickers', (req, res) => {
  res.json(db.prepare('SELECT * FROM stickers ORDER BY sort, id').all());
});

router.post('/stickers', (req, res) => {
  const b = req.body;
  const code = String(b.code || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  if (!code) return res.status(400).json({ error: 'code ไม่ถูกต้อง (a-z, 0-9, _)' });
  if (db.prepare('SELECT 1 FROM stickers WHERE code = ?').get(code)) return res.status(409).json({ error: 'code นี้มีอยู่แล้ว' });
  db.prepare(`INSERT INTO stickers (code, name, emoji, image_url, cost, animation, enabled, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    code, clean(b.name || code, 40), clean(b.emoji || '', 8), clean(b.image_url || '', 300),
    Math.max(0, Math.floor(Number(b.cost)) || 0), clean(b.animation || 'float', 20),
    b.enabled === false ? 0 : 1, Math.floor(Number(b.sort)) || 0);
  res.json({ ok: true });
});

router.put('/stickers/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM stickers WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'ไม่พบสติกเกอร์' });
  const b = req.body;
  db.prepare(`UPDATE stickers SET name=?, emoji=?, image_url=?, cost=?, animation=?, enabled=?, sort=? WHERE id=?`).run(
    clean(b.name ?? s.name, 40),
    clean(b.emoji ?? s.emoji ?? '', 8),
    clean(b.image_url ?? s.image_url ?? '', 300),
    b.cost !== undefined ? Math.max(0, Math.floor(Number(b.cost)) || 0) : s.cost,
    clean(b.animation ?? s.animation, 20),
    b.enabled !== undefined ? (b.enabled ? 1 : 0) : s.enabled,
    b.sort !== undefined ? (Math.floor(Number(b.sort)) || 0) : s.sort,
    s.id);
  res.json({ ok: true });
});

router.delete('/stickers/:id', (req, res) => {
  db.prepare('DELETE FROM stickers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- config ----------
router.get('/config', (req, res) => {
  res.json(Object.fromEntries(db.prepare('SELECT key, value FROM config').all().map((r) => [r.key, r.value])));
});

router.put('/config', (req, res) => {
  const allowed = ['site_name', 'platform_fee_percent', 'default_min_donation', 'default_max_donation', 'topup_packages'];
  if (req.body.topup_packages !== undefined) {
    try { JSON.parse(req.body.topup_packages); } catch { return res.status(400).json({ error: 'topup_packages ต้องเป็น JSON array' }); }
  }
  for (const k of allowed) if (req.body[k] !== undefined) setConfigValue(k, req.body[k]);
  res.json({ ok: true });
});

// ---------- lists ----------
router.get('/donations', (req, res) => {
  res.json(db.prepare(`SELECT d.*, du.username donor_username, su.username streamer_username
    FROM donations d
    LEFT JOIN users du ON du.id = d.donor_user_id
    JOIN users su ON su.id = d.streamer_user_id
    ORDER BY d.id DESC LIMIT 200`).all());
});

router.get('/topups', (req, res) => {
  res.json(db.prepare(`SELECT t.*, u.username FROM topups t JOIN users u ON u.id = t.user_id
    ORDER BY t.id DESC LIMIT 200`).all());
});

router.get('/payouts', (req, res) => {
  res.json(db.prepare(`SELECT p.*, u.username FROM payouts p JOIN users u ON u.id = p.user_id
    ORDER BY p.id DESC LIMIT 200`).all());
});

router.post('/payouts/:id/process', (req, res) => {
  const p = db.prepare('SELECT * FROM payouts WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'ไม่พบรายการ' });
  if (p.status !== 'pending') return res.status(400).json({ error: 'รายการนี้ถูกดำเนินการแล้ว' });
  const status = ['paid', 'rejected'].includes(req.body.status) ? req.body.status : 'paid';

  db.transaction(() => {
    db.prepare('UPDATE payouts SET status=?, processed_at=?, note=? WHERE id=?')
      .run(status, now(), clean(req.body.note || '', 200), p.id);
    if (status === 'rejected') {
      db.prepare('UPDATE users SET earnings_balance = earnings_balance + ? WHERE id = ?').run(p.amount, p.user_id);
      const bal = db.prepare('SELECT earnings_balance v FROM users WHERE id = ?').get(p.user_id).v;
      addLedger(p.user_id, 'withdraw_refund', p.amount, bal, 'payout', p.id, 'คืนยอดคำขอถอนที่ถูกปฏิเสธ');
    }
  })();
  res.json({ ok: true });
});

module.exports = router;
