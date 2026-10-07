const express = require('express');
const { db } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { now, clean } = require('../util');
const notify = require('../notify');

// ติดต่อแอดมิน: ผู้ใช้เปิดเรื่อง (ticket) แล้วคุยกับแอดมินเป็นข้อความต่อกัน
const router = express.Router();
router.use(requireAuth);

const CATEGORIES = ['บัญชีผู้ใช้', 'แพลน / ชำระเงิน', 'โดเนท / สลิป', 'Overlay / OBS', 'อื่น ๆ'];
const STATUSES = ['open', 'answered', 'closed'];
const MAX_BODY = 2000;

function getTicket(id) {
  return db.prepare(`SELECT t.*, u.username, u.display_name, u.avatar_url, u.role AS user_role
    FROM support_tickets t JOIN users u ON u.id = t.user_id WHERE t.id = ?`).get(id);
}
function messages(ticketId) {
  return db.prepare(`SELECT m.id, m.body, m.is_admin, m.created_at, u.username, u.display_name
    FROM support_messages m JOIN users u ON u.id = m.sender_id WHERE m.ticket_id = ? ORDER BY m.id`).all(ticketId);
}
function addMessage(ticketId, senderId, isAdmin, body) {
  db.prepare('INSERT INTO support_messages (ticket_id, sender_id, is_admin, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(ticketId, senderId, isAdmin ? 1 : 0, body, now());
}

// อัปเดตหน้าจอที่เปิดเรื่องนี้ค้างไว้ (ทั้งเจ้าของเรื่องและแอดมินทุกคน)
function broadcast(req, t) {
  const io = req.app.get('io');
  const payload = { id: t.id };
  io.to('user:' + t.user_id).emit('support:update', payload);
  db.prepare("SELECT id FROM users WHERE role = 'admin'").all().forEach((a) => io.to('user:' + a.id).emit('support:update', payload));
}

function notifyAdmins(exceptId, title, body, ticketId) {
  db.prepare("SELECT id FROM users WHERE role = 'admin' AND id != ?").all(exceptId || 0).forEach((a) => {
    notify.add(a.id, { type: 'support', title, body, link: '/admin.html#support/' + ticketId });
  });
}

const bodyOf = (req) => clean(String(req.body.body || ''), MAX_BODY).trim();

// ---------- ผู้ใช้ ----------
router.get('/categories', (req, res) => res.json(CATEGORIES));

router.get('/tickets', (req, res) => {
  res.json(db.prepare(`SELECT t.id, t.subject, t.category, t.status, t.user_unread AS unread, t.created_at, t.updated_at,
      (SELECT body FROM support_messages WHERE ticket_id = t.id ORDER BY id DESC LIMIT 1) AS last_body
    FROM support_tickets t WHERE t.user_id = ? ORDER BY t.updated_at DESC`).all(req.user.id));
});

router.post('/tickets', (req, res) => {
  const subject = clean(String(req.body.subject || ''), 120).trim();
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : 'อื่น ๆ';
  const body = bodyOf(req);
  if (!subject) return res.status(400).json({ error: 'กรุณาใส่หัวข้อ' });
  if (!body) return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความ' });
  // กันสแปม: เปิดเรื่องใหม่ได้ไม่เกิน 5 เรื่องต่อชั่วโมง
  const recent = db.prepare('SELECT COUNT(*) c FROM support_tickets WHERE user_id = ? AND created_at > ?').get(req.user.id, now() - 3600 * 1000).c;
  if (recent >= 5) return res.status(429).json({ error: 'เปิดเรื่องใหม่บ่อยเกินไป กรุณารอสักครู่ หรือพิมพ์ต่อในเรื่องเดิม' });

  const t = now();
  const info = db.prepare(`INSERT INTO support_tickets (user_id, subject, category, status, user_unread, admin_unread, created_at, updated_at)
    VALUES (?, ?, ?, 'open', 0, 1, ?, ?)`).run(req.user.id, subject, category, t, t);
  addMessage(info.lastInsertRowid, req.user.id, false, body);
  const ticket = getTicket(info.lastInsertRowid);
  notifyAdmins(req.user.id, `ข้อความใหม่จาก @${req.user.username}: ${subject}`, body.slice(0, 120), ticket.id);
  broadcast(req, ticket);
  res.json({ ok: true, id: ticket.id });
});

router.get('/tickets/:id', (req, res) => {
  const t = getTicket(req.params.id);
  if (!t || t.user_id !== req.user.id) return res.status(404).json({ error: 'ไม่พบเรื่องนี้' });
  db.prepare('UPDATE support_tickets SET user_unread = 0 WHERE id = ?').run(t.id);
  res.json({ ticket: { id: t.id, subject: t.subject, category: t.category, status: t.status, created_at: t.created_at }, messages: messages(t.id) });
});

router.post('/tickets/:id/messages', (req, res) => {
  const t = getTicket(req.params.id);
  if (!t || t.user_id !== req.user.id) return res.status(404).json({ error: 'ไม่พบเรื่องนี้' });
  const body = bodyOf(req);
  if (!body) return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความ' });
  addMessage(t.id, req.user.id, false, body);
  // ผู้ใช้ตอบในเรื่องที่ปิดไปแล้ว = เปิดเรื่องอีกครั้ง
  db.prepare("UPDATE support_tickets SET status = 'open', admin_unread = admin_unread + 1, updated_at = ? WHERE id = ?").run(now(), t.id);
  notifyAdmins(req.user.id, `@${req.user.username} ตอบกลับ: ${t.subject}`, body.slice(0, 120), t.id);
  broadcast(req, t);
  res.json({ ok: true });
});

router.post('/tickets/:id/close', (req, res) => {
  const t = getTicket(req.params.id);
  if (!t || t.user_id !== req.user.id) return res.status(404).json({ error: 'ไม่พบเรื่องนี้' });
  db.prepare("UPDATE support_tickets SET status = 'closed', updated_at = ? WHERE id = ?").run(now(), t.id);
  broadcast(req, t);
  res.json({ ok: true });
});

// ---------- แอดมิน ----------
const admin = express.Router();
admin.use(requireRole('admin'));

admin.get('/', (req, res) => {
  const status = STATUSES.includes(req.query.status) ? req.query.status : null;
  res.json(db.prepare(`SELECT t.id, t.subject, t.category, t.status, t.admin_unread AS unread, t.created_at, t.updated_at,
      u.username, u.display_name, u.avatar_url,
      (SELECT body FROM support_messages WHERE ticket_id = t.id ORDER BY id DESC LIMIT 1) AS last_body
    FROM support_tickets t JOIN users u ON u.id = t.user_id
    ${status ? 'WHERE t.status = ?' : ''} ORDER BY (t.status = 'closed'), t.updated_at DESC LIMIT 300`).all(...(status ? [status] : [])));
});

admin.get('/:id', (req, res) => {
  const t = getTicket(req.params.id);
  if (!t) return res.status(404).json({ error: 'ไม่พบเรื่องนี้' });
  db.prepare('UPDATE support_tickets SET admin_unread = 0 WHERE id = ?').run(t.id);
  const u = db.prepare('SELECT email, created_at FROM users WHERE id = ?').get(t.user_id);
  res.json({ ticket: t, user: u, messages: messages(t.id) });
});

admin.post('/:id/messages', (req, res) => {
  const t = getTicket(req.params.id);
  if (!t) return res.status(404).json({ error: 'ไม่พบเรื่องนี้' });
  const body = bodyOf(req);
  if (!body) return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความ' });
  addMessage(t.id, req.user.id, true, body);
  db.prepare("UPDATE support_tickets SET status = 'answered', user_unread = user_unread + 1, admin_unread = 0, updated_at = ? WHERE id = ?").run(now(), t.id);
  notify.add(t.user_id, { type: 'support', title: `แอดมินตอบกลับ: ${t.subject}`, body: body.slice(0, 120), link: '/dashboard.html#support/' + t.id });
  broadcast(req, t);
  res.json({ ok: true });
});

admin.post('/:id/status', (req, res) => {
  const t = getTicket(req.params.id);
  if (!t) return res.status(404).json({ error: 'ไม่พบเรื่องนี้' });
  const status = STATUSES.includes(req.body.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
  db.prepare('UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), t.id);
  broadcast(req, t);
  res.json({ ok: true });
});

router.use('/admin', admin);

// จำนวนเรื่องที่ยังไม่ได้อ่าน (ป้ายบนเมนู)
router.get('/unread', (req, res) => {
  const mine = db.prepare('SELECT COALESCE(SUM(user_unread),0) n FROM support_tickets WHERE user_id = ?').get(req.user.id).n;
  const forAdmin = req.user.role === 'admin'
    ? db.prepare("SELECT COUNT(*) n FROM support_tickets WHERE admin_unread > 0 OR status = 'open'").get().n : 0;
  res.json({ mine, admin: forAdmin });
});

module.exports = router;
