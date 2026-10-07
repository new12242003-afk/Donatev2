const express = require('express');
const bcrypt = require('bcryptjs');
const { db, setConfigValue } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { now, clean, token } = require('../util');
const slips = require('../slips');
const notify = require('../notify');
const planOrders = require('../planOrders');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/stats', (req, res) => {
  const DAY = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const users = db.prepare('SELECT role, COUNT(*) c FROM users GROUP BY role').all();
  const donations = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(total_cost),0) v, COALESCE(SUM(platform_fee),0) fee FROM donations').get();
  const donToday = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(total_cost),0) v FROM donations WHERE created_at >= ?').get(today);
  // รายได้เว็บ = ค่าแพลนที่ชำระแล้ว (โดเนทโอนตรงเข้าบัญชีสตรีมเมอร์ ไม่ผ่านเว็บ)
  const planRev = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(price),0) v FROM plan_orders WHERE status = 'paid'").get();
  const planToday = db.prepare("SELECT COALESCE(SUM(price),0) v FROM plan_orders WHERE status = 'paid' AND paid_at >= ?").get(today);
  const planReview = db.prepare("SELECT COUNT(*) c FROM plan_orders WHERE status = 'review'").get();
  const newUsers = db.prepare('SELECT COUNT(*) c FROM users WHERE created_at >= ?').get(today - 6 * DAY);
  // ยอดโดเนทรายวัน 14 วันล่าสุด (รวมวันนี้) สำหรับกราฟในหน้าภาพรวม
  const from = today - 13 * DAY;
  const rows = db.prepare('SELECT created_at, total_cost FROM donations WHERE created_at >= ?').all(from);
  const series = Array.from({ length: 14 }, (_, i) => ({ day: from + i * DAY, v: 0, c: 0 }));
  rows.forEach((r) => {
    const i = Math.floor((r.created_at - from) / DAY);
    if (series[i]) { series[i].v += r.total_cost; series[i].c += 1; }
  });
  res.json({
    users, donations, plan_revenue: planRev.v, plan_orders_paid: planRev.c, plan_review: planReview.c,
    today: { donations: donToday.c, donation_value: donToday.v, plan_revenue: planToday.v },
    new_users_7d: newUsers.c, series,
  });
});

// ---------- users ----------
router.get('/users', (req, res) => {
  const q = '%' + String(req.query.q || '').toLowerCase() + '%';
  res.json(db.prepare(`SELECT id, username, email, role, display_name, avatar_url, email_verified,
      overlay_key, banned, created_at, plan_expires_at
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
  const allowed = ['site_name', 'default_min_donation', 'default_max_donation'];
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

// ---------- ชำระค่าแพลน (QR พร้อมเพย์ของเว็บ) ----------
router.get('/plan-orders', (req, res) => {
  // รายการรอตรวจสลิปขึ้นก่อนเสมอ (ไม่หลุดไปนอก 200 รายการล่าสุด)
  res.json(db.prepare(`SELECT o.id, o.user_id, o.reference, o.plan_id, o.plan_label, o.price, o.status, o.created_at,
      o.paid_at, o.expires_at, o.trans_ref, o.note, o.reviewed_at, o.slip_file IS NOT NULL AS has_slip, u.username
    FROM plan_orders o JOIN users u ON u.id = o.user_id
    ORDER BY (o.status = 'review') DESC, o.id DESC LIMIT 200`).all());
});

// ตรวจสลิปค่าแพลนเอง: อนุมัติ (ต่ออายุแพลน) / ปฏิเสธ (ระบุเหตุผล) — รับได้ทั้งรายการที่มีสลิปรอตรวจ และรายการรอจ่าย
// (กรณีผู้ใช้โอนแล้วแต่ส่งสลิปทางช่องทางอื่น เช่น ติดต่อแอดมิน)
router.post('/plan-orders/:id/process', (req, res) => {
  const o = db.prepare('SELECT * FROM plan_orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'ไม่พบรายการ' });
  if (!['pending', 'review'].includes(o.status)) return res.status(400).json({ error: 'รายการนี้ถูกดำเนินการแล้ว' });
  const status = req.body.status === 'rejected' ? 'rejected' : 'paid';
  const note = clean(req.body.note || '', 200);
  if (status === 'rejected' && !note) return res.status(400).json({ error: 'กรุณาระบุเหตุผลที่ปฏิเสธ' });

  let updated;
  if (status === 'paid') {
    updated = planOrders.markPaid(o.id, { note: note || `อนุมัติโดย @${req.user.username}` });
  } else {
    const r = db.prepare(`UPDATE plan_orders SET status = 'rejected', note = ? WHERE id = ? AND status IN ('pending', 'review')`).run(note, o.id);
    updated = r.changes ? db.prepare('SELECT * FROM plan_orders WHERE id = ?').get(o.id) : null;
  }
  if (!updated) return res.status(409).json({ error: 'รายการนี้ถูกดำเนินการไปแล้ว' });
  db.prepare('UPDATE plan_orders SET reviewed_at = ? WHERE id = ?').run(now(), o.id);
  notify.planOrderProcessed(updated, status, note);
  res.json({ ok: true });
});

router.get('/plan-orders/:id/slip', (req, res) => {
  const o = db.prepare('SELECT slip_file FROM plan_orders WHERE id = ?').get(req.params.id);
  slips.sendSlip(res, o && o.slip_file);
});

module.exports = router;
