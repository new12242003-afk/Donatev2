const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAuth, publicUser } = require('../auth');
const { token, now, clean } = require('../util');
const { sendVerifyEmail } = require('../mailer');
const { sanitizeSocialLinks } = require('../social');
const { cleanCategories } = require('../categories');
const { broadcastProfile } = require('../live');
const plans = require('../plans');
const notify = require('../notify');

const router = express.Router();
router.use(requireAuth);

const BASE_URL = process.env.BASE_URL || 'http://localhost:' + (process.env.PORT || 3000);
const VERIFY_TTL = 24 * 3600 * 1000;
const { uploadDir, removeUpload, SHOW_DEV_CODES } = require('../config');
const AVATAR_DIR = uploadDir('avatars');
const COVER_DIR = uploadDir('covers');

router.get('/', (req, res) => res.json(publicUser(req.user)));

// การแจ้งเตือน (กระดิ่งบนแถบเมนู)
router.get('/notifications', (req, res) => res.json(notify.list(req.user)));
router.delete('/notifications', (req, res) => {
  notify.clearAll(req.user.id);
  res.json({ ok: true });
});
router.post('/notifications/read', (req, res) => {
  notify.markRead(req.user.id, req.body.id ? Number(req.body.id) : null);
  res.json({ ok: true });
});

// รายละเอียดแพลน + ประวัติการสมัครแพลน (แดชบอร์ด)
router.get('/plan', (req, res) => res.json(plans.planDetails(req.user)));

router.patch('/', (req, res) => {
  // username เป็นข้อมูลถาวรของบัญชี แก้ไขไม่ได้แม้จะส่งมาใน body
  const b = req.body || {};

  // ตรวจลิงก์โซเชียลก่อนบันทึกอะไรทั้งหมด — ลิงก์ผิดจะไม่บันทึกฟิลด์อื่นค้างไว้ครึ่งทาง
  let social = null;
  if (b.social_links !== undefined) {
    social = sanitizeSocialLinks(b.social_links);
    if (social.error) return res.status(400).json({ error: social.error });
  }
  // หมวดหลัก + หมวดย่อย ต้องอยู่ในรายการของ src/categories.js
  let cats = null;
  if (b.creator_category !== undefined) {
    cats = cleanCategories(b.creator_category, b.creator_subcategories, req.user.creator_category);
    if (cats.error) return res.status(400).json({ error: cats.error });
  }

  const dn = clean(b.display_name || '', 40);
  if (dn) db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(dn, req.user.id);

  // ข้อมูลโปรไฟล์สาธารณะ — bio และหมวดหมู่ครีเอเตอร์ แสดงในหน้าโดเนทสาธารณะ
  if (b.bio !== undefined) db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(clean(b.bio || '', 160), req.user.id);
  if (cats) {
    db.prepare('UPDATE users SET creator_category = ?, creator_subcategories = ? WHERE id = ?')
      .run(cats.category, JSON.stringify(cats.subs), req.user.id);
  }
  if (social) db.prepare('UPDATE users SET social_links = ? WHERE id = ?').run(JSON.stringify(social.links), req.user.id);

  // ข้อมูลผู้ใช้งาน — ไม่บังคับกรอก เก็บเป็นค่าว่างได้ / ฟิลด์ที่ไม่ได้ส่งมาจะคงค่าเดิมไว้
  const pick = (key, max, digitsOnly) => {
    if (b[key] === undefined) return req.user[key] || '';
    let v = clean(b[key] || '', max);
    if (digitsOnly) v = v.replace(/[^0-9]/g, '');
    return v;
  };
  db.prepare(`UPDATE users SET
      first_name = ?, last_name = ?, nickname = ?, national_id = ?, birth_date = ?,
      address_line = ?, address_subdistrict = ?, address_district = ?,
      address_province = ?, address_zipcode = ?
    WHERE id = ?`).run(
    pick('first_name', 60), pick('last_name', 60), pick('nickname', 40),
    pick('national_id', 13, true), pick('birth_date', 10),
    pick('address_line', 200), pick('address_subdistrict', 60),
    pick('address_district', 60), pick('address_province', 60),
    pick('address_zipcode', 10, true),
    req.user.id);

  // แก้ข้อมูลที่ผู้ชมเห็น → หน้าสาธารณะที่เปิดอยู่อัปเดตทันที
  if (dn || b.bio !== undefined || cats || social) broadcastProfile(req.user.id);
  res.json({ ok: true, social_links: social ? social.links : undefined });
});

router.post('/email', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
  if (email === req.user.email) return res.json({ ok: true, unchanged: true });
  if (db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(email, req.user.id)) {
    return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });
  }

  const vtoken = token(24);
  db.prepare('UPDATE users SET email = ?, email_verified = 0, verify_token = ?, verify_expires = ? WHERE id = ?')
    .run(email, vtoken, now() + VERIFY_TTL, req.user.id);

  const link = `${BASE_URL}/auth/verify?token=${vtoken}`;
  const r = await sendVerifyEmail(email, link).catch((e) => ({ sent: false, error: e.message }));
  res.json({ ok: true, mailSent: !!r.sent, devLink: r.sent || !SHOW_DEV_CODES ? undefined : link });
});

router.post('/avatar', (req, res) => {
  const data = String(req.body.image || '');
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,([a-zA-Z0-9+/=]+)$/.exec(data);
  if (!m) return res.status(400).json({ error: 'รูปภาพไม่ถูกต้อง (รองรับ PNG, JPG, WEBP, GIF)' });

  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) return res.status(400).json({ error: 'ไฟล์ใหญ่เกินไป (สูงสุด 3MB)' });

  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const filename = `u${req.user.id}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(AVATAR_DIR, filename), buf);
  const url = '/uploads/avatars/' + filename;
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(url, req.user.id);

  const old = req.user.avatar_url;
  if (old && old.startsWith('/uploads/avatars/')) {
    removeUpload(old);
  }
  broadcastProfile(req.user.id);
  res.json({ ok: true, avatar_url: url });
});

// รูปพื้นหลัง (ปก) ของการ์ดในหน้าสตรีมเมอร์ — หน้าเว็บย่อรูปก่อนส่ง (กว้างไม่เกิน 1200px)
function removeCoverFile(url) {
  if (url && url.startsWith('/uploads/covers/')) {
    removeUpload(url);
  }
}

router.post('/cover', (req, res) => {
  const m = /^data:image\/(png|jpe?g|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(String(req.body.image || ''));
  if (!m) return res.status(400).json({ error: 'รูปภาพไม่ถูกต้อง (รองรับ PNG, JPG, WEBP)' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'ไฟล์ใหญ่เกินไป (สูงสุด 5MB)' });

  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const filename = `c${req.user.id}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(COVER_DIR, filename), buf);
  const url = '/uploads/covers/' + filename;
  db.prepare('UPDATE users SET cover_url = ? WHERE id = ?').run(url, req.user.id);
  removeCoverFile(req.user.cover_url);
  broadcastProfile(req.user.id);
  res.json({ ok: true, cover_url: url });
});

router.delete('/cover', (req, res) => {
  db.prepare('UPDATE users SET cover_url = NULL WHERE id = ?').run(req.user.id);
  removeCoverFile(req.user.cover_url);
  broadcastProfile(req.user.id);
  res.json({ ok: true });
});

router.post('/password', (req, res) => {
  const { current, next } = req.body;
  if (!req.user.password_hash) return res.status(400).json({ error: 'บัญชี Google ยังไม่มีรหัสผ่าน (ตั้งใหม่ได้เลย)' });
  if (req.user.password_hash && !bcrypt.compareSync(String(current || ''), req.user.password_hash)) {
    return res.status(401).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
  }
  if (String(next || '').length < 6) return res.status(400).json({ error: 'รหัสผ่านใหม่อย่างน้อย 6 ตัว' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), req.user.id);
  res.json({ ok: true });
});

router.post('/become-streamer', (req, res) => {
  if (req.user.role === 'admin') return res.status(400).json({ error: 'บัญชีแอดมินใช้งาน Overlay ได้อยู่แล้ว' });
  const key = req.user.overlay_key || token(20);
  db.prepare("UPDATE users SET role = 'streamer', overlay_key = ? WHERE id = ?").run(key, req.user.id);
  db.prepare('INSERT OR IGNORE INTO streamer_settings (user_id, updated_at) VALUES (?, ?)').run(req.user.id, now());
  if (req.user.role === 'donor') plans.startTrialOnUpgrade(req.user);
  res.json({ ok: true });
});

router.get('/transactions', (req, res) => {
  res.json(db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id));
});

module.exports = router;
