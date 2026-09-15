const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const { token, now, clean } = require('../util');
const { sendVerifyEmail } = require('../mailer');
const { passport, googleEnabled } = require('../google');
const { publicUser } = require('../auth');

const router = express.Router();
const BASE_URL = process.env.BASE_URL || 'http://localhost:' + (process.env.PORT || 3000);
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

const VERIFY_TTL = 24 * 3600 * 1000;

router.post('/register', limiter, async (req, res) => {
  let { username, email, password, role, display_name } = req.body;
  username = String(username || '').trim().toLowerCase();
  email = String(email || '').trim().toLowerCase();
  role = ['streamer', 'donor'].includes(role) ? role : 'donor';

  if (!/^[a-z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: 'ชื่อผู้ใช้ 3-20 ตัว (a-z, 0-9, _)' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
  if (String(password || '').length < 6) return res.status(400).json({ error: 'รหัสผ่านอย่างน้อย 6 ตัวอักษร' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: 'มีชื่อผู้ใช้นี้แล้ว' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });

  const vtoken = token(24);
  const info = db.prepare(`INSERT INTO users
    (username, email, password_hash, role, display_name, verify_token, verify_expires, overlay_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    username, email, bcrypt.hashSync(password, 10), role, clean(display_name || username, 40),
    vtoken, now() + VERIFY_TTL, role === 'streamer' ? token(20) : null, now());

  if (role === 'streamer') {
    db.prepare('INSERT OR IGNORE INTO streamer_settings (user_id, updated_at) VALUES (?, ?)').run(info.lastInsertRowid, now());
  }

  const link = `${BASE_URL}/auth/verify?token=${vtoken}`;
  const r = await sendVerifyEmail(email, link).catch((e) => ({ sent: false, error: e.message }));
  res.json({ ok: true, mailSent: !!r.sent, devLink: r.sent ? undefined : link });
});

router.get('/verify', (req, res) => {
  const t = String(req.query.token || '');
  const u = db.prepare('SELECT * FROM users WHERE verify_token = ?').get(t);
  if (!u || (u.verify_expires && u.verify_expires < now())) return res.redirect('/login.html?verify=expired');
  db.prepare('UPDATE users SET email_verified = 1, verify_token = NULL, verify_expires = NULL WHERE id = ?').run(u.id);
  res.redirect('/login.html?verify=ok');
});

router.post('/resend', limiter, async (req, res) => {
  const id = String(req.body.username || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(id, id);
  if (!u) return res.status(404).json({ error: 'ไม่พบผู้ใช้นี้' });
  if (u.email_verified) return res.json({ ok: true, already: true });

  const vtoken = token(24);
  db.prepare('UPDATE users SET verify_token = ?, verify_expires = ? WHERE id = ?').run(vtoken, now() + VERIFY_TTL, u.id);
  const link = `${BASE_URL}/auth/verify?token=${vtoken}`;
  const r = await sendVerifyEmail(u.email, link).catch(() => ({ sent: false }));
  res.json({ ok: true, mailSent: !!r.sent, devLink: r.sent ? undefined : link });
});

router.post('/login', limiter, (req, res) => {
  const id = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const u = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(id, id);
  if (!u || !u.password_hash || !bcrypt.compareSync(password, u.password_hash)) {
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
  if (u.banned) return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน' });
  if (!u.email_verified) return res.status(403).json({ error: 'ยังไม่ได้ยืนยันอีเมล', code: 'unverified' });

  req.session.userId = u.id;
  res.json({ ok: true, user: publicUser(u) });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/config', (req, res) => res.json({ googleEnabled }));

if (googleEnabled) {
  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

  router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/login.html?google=fail' }),
    (req, res) => {
      const p = req.user;
      const gid = p.id;
      const email = ((p.emails && p.emails[0] && p.emails[0].value) || '').toLowerCase();

      let u = db.prepare('SELECT * FROM users WHERE google_id = ?').get(gid);
      if (!u && email) u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

      if (!u) {
        let base = (email ? email.split('@')[0] : 'user').replace(/[^a-z0-9_]/g, '').slice(0, 16) || 'user';
        let uname = base, i = 1;
        while (db.prepare('SELECT 1 FROM users WHERE username = ?').get(uname)) uname = base + i++;
        const info = db.prepare(`INSERT INTO users
          (username, email, password_hash, role, display_name, email_verified, google_id, created_at)
          VALUES (?, ?, '', 'donor', ?, 1, ?, ?)`).run(uname, email || null, clean(p.displayName || uname, 40), gid, now());
        u = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      } else if (!u.google_id) {
        db.prepare('UPDATE users SET google_id = ?, email_verified = 1 WHERE id = ?').run(gid, u.id);
      }

      req.session.userId = u.id;
      res.redirect('/dashboard.html');
    });
}

module.exports = router;
