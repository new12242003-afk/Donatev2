const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const { token, now, clean } = require('../util');
const crypto = require('crypto');
const { SHOW_DEV_CODES } = require('../config');
const { sendVerifyEmail, sendCodeEmail, mailEnabled } = require('../mailer');

// แสดงลิงก์ยืนยันบนหน้าเว็บเฉพาะตอนยังไม่ได้ตั้งค่าอีเมล (โหมดทดสอบ) — ถ้าตั้งค่าแล้วแต่ส่งไม่สำเร็จ
// ห้ามส่งลิงก์กลับไป ไม่งั้นใครก็ยืนยันอีเมลปลอมได้เอง
function mailResult(r, link) {
  if (r.sent) return { mailSent: true };
  if (mailEnabled() || !SHOW_DEV_CODES) return { mailSent: false, mailError: true };
  return { mailSent: false, devLink: link };
}
const { passport, googleEnabled } = require('../google');
const { publicUser } = require('../auth');

const router = express.Router();
const BASE_URL = process.env.BASE_URL || 'http://localhost:' + (process.env.PORT || 3000);
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

const VERIFY_TTL = 24 * 3600 * 1000;
const CODE_TTL = 5 * 60 * 1000;
const CODE_RESEND_MS = 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const hashCode = (email, code) => crypto.createHash('sha256').update(email + ':' + code).digest('hex');

// รหัส 6 หลักทางอีเมล ใช้ทั้งสมัครสมาชิกและลืมรหัสผ่าน — แยกกันด้วย key ในตาราง email_codes
// (สมัคร = "<email>", ลืมรหัสผ่าน = "reset:<email>") ส่งซ้ำได้ทุก 60 วินาที
async function issueCode(res, key, email, purpose) {
  const prev = db.prepare('SELECT sent_at FROM email_codes WHERE email = ?').get(key);
  if (prev && now() - prev.sent_at < CODE_RESEND_MS) {
    const wait = Math.ceil((CODE_RESEND_MS - (now() - prev.sent_at)) / 1000);
    return res.status(429).json({ error: `กรุณารอ ${wait} วินาทีก่อนขอรหัสใหม่`, wait });
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  db.prepare(`INSERT INTO email_codes (email, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?)
    ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at`)
    .run(key, hashCode(key, code), now() + CODE_TTL, now());

  const r = await sendCodeEmail(email, code, purpose).catch(() => ({ sent: false }));
  if (r.sent) return res.json({ ok: true, mailSent: true, resend_in: CODE_RESEND_MS / 1000 });
  if (mailEnabled() || !SHOW_DEV_CODES) {
    db.prepare('DELETE FROM email_codes WHERE email = ?').run(key);
    return res.status(502).json({ error: mailEnabled() ? 'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่ภายหลัง' : 'ระบบส่งอีเมลยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแลเว็บ' });
  }
  // ยังไม่ได้ตั้งค่าอีเมล (โหมดทดสอบ) — แสดงรหัสบนหน้าเว็บแทน
  res.json({ ok: true, mailSent: false, devCode: code, resend_in: CODE_RESEND_MS / 1000 });
}

// ตรวจรหัส — ผิดเกิน 5 ครั้งต้องขอรหัสใหม่ / ถูกแล้วผู้เรียกต้องลบรหัสทิ้ง (ใช้ได้ครั้งเดียว)
function checkCode(key, code) {
  const row = db.prepare('SELECT * FROM email_codes WHERE email = ?').get(key);
  if (!row) return 'กรุณากด "ส่งรหัสยืนยัน" ก่อน';
  if (row.expires_at < now()) return 'รหัสยืนยันหมดอายุ กรุณาขอรหัสใหม่';
  if (row.attempts >= CODE_MAX_ATTEMPTS) return 'ใส่รหัสผิดหลายครั้งเกินไป กรุณาขอรหัสใหม่';
  const a = Buffer.from(row.code_hash, 'hex');
  const b = Buffer.from(hashCode(key, String(code || '').trim()), 'hex');
  if (!crypto.timingSafeEqual(a, b)) {
    db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?').run(key);
    return 'รหัสยืนยันไม่ถูกต้อง';
  }
  return null;
}

router.post('/register/send-code', limiter, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });
  return issueCode(res, email, email, 'register');
});

// ยืนยัน OTP ทันทีที่กรอก (ก่อนกดสมัคร) — ถูกแล้วจำไว้ใน session ว่าเบราว์เซอร์นี้ยืนยันอีเมลนี้แล้ว 30 นาที
const REG_VERIFIED_TTL = 30 * 60 * 1000;
router.post('/register/verify-code', limiter, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
  const codeErr = checkCode(email, req.body.code);
  if (codeErr) return res.status(400).json({ error: codeErr });
  db.prepare('DELETE FROM email_codes WHERE email = ?').run(email);
  req.session.regVerified = { email, at: now() };
  res.json({ ok: true, email });
});

function regVerifiedEmail(req) {
  const v = req.session && req.session.regVerified;
  return v && now() - v.at < REG_VERIFIED_TTL ? v.email : null;
}

// ---------- ลืมรหัสผ่าน: ส่งรหัสไปที่อีเมลของบัญชี → ใส่รหัส + รหัสผ่านใหม่ ----------
router.post('/forgot/send-code', limiter, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
  if (!db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(404).json({ error: 'ไม่พบบัญชีที่ใช้อีเมลนี้' });
  return issueCode(res, 'reset:' + email, email, 'reset');
});

router.post('/forgot/reset', limiter, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u) return res.status(404).json({ error: 'ไม่พบบัญชีที่ใช้อีเมลนี้' });
  if (password.length < 6) return res.status(400).json({ error: 'รหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร', field: 'password' });
  const key = 'reset:' + email;
  const codeErr = checkCode(key, req.body.code);
  if (codeErr) return res.status(400).json({ error: codeErr, field: 'code' });

  // รับรหัสจากอีเมลได้ = เป็นเจ้าของอีเมลจริง จึงถือว่ายืนยันอีเมลแล้วด้วย (บัญชีเก่าที่ยังไม่ได้ยืนยันเข้าใช้ได้)
  db.prepare('UPDATE users SET password_hash = ?, email_verified = 1, verify_token = NULL, verify_expires = NULL WHERE id = ?')
    .run(bcrypt.hashSync(password, 10), u.id);
  db.prepare('DELETE FROM email_codes WHERE email = ?').run(key);
  res.json({ ok: true, username: u.username });
});

router.post('/register', limiter, (req, res) => {
  let { username, email, password, role, display_name } = req.body;
  username = String(username || '').trim().toLowerCase();
  email = String(email || '').trim().toLowerCase();
  role = ['streamer', 'donor'].includes(role) ? role : 'donor';

  if (!/^[a-z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: 'ชื่อผู้ใช้ 3-20 ตัว (a-z, 0-9, _)' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
  if (String(password || '').length < 6) return res.status(400).json({ error: 'รหัสผ่านอย่างน้อย 6 ตัวอักษร' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: 'มีชื่อผู้ใช้นี้แล้ว' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });
  // ต้องยืนยัน OTP ของอีเมลนี้แล้ว (กด "ยืนยัน OTP" มาก่อน) หรือส่งรหัสที่ถูกต้องมาพร้อมกัน
  if (regVerifiedEmail(req) !== email) {
    if (!req.body.code) return res.status(400).json({ error: 'กรุณายืนยันอีเมลด้วยรหัส OTP ก่อน', field: 'code' });
    const codeErr = checkCode(email, req.body.code);
    if (codeErr) return res.status(400).json({ error: codeErr, field: 'code' });
  }

  // รหัสถูกต้อง = ยืนยันอีเมลแล้ว ไม่ต้องคลิกลิงก์อีก
  const info = db.prepare(`INSERT INTO users
    (username, email, password_hash, role, display_name, email_verified, overlay_key, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)`).run(
    username, email, bcrypt.hashSync(password, 10), role, clean(display_name || username, 40),
    role === 'streamer' ? token(20) : null, now());
  db.prepare('DELETE FROM email_codes WHERE email = ?').run(email);
  delete req.session.regVerified;

  if (role === 'streamer') {
    db.prepare('INSERT OR IGNORE INTO streamer_settings (user_id, updated_at) VALUES (?, ?)').run(info.lastInsertRowid, now());
  }

  // สมัครเสร็จแล้วเข้าสู่ระบบให้เลย
  req.session.userId = info.lastInsertRowid;
  res.json({ ok: true });
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
  res.json({ ok: true, ...mailResult(r, link) });
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
