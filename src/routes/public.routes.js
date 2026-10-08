const express = require('express');
const { db, getConfig } = require('../db');
const { now } = require('../util');
const { parseSocialLinks } = require('../social');
const live = require('../live');
const { CREATOR_CATEGORIES, MAX_SUBS, parseSubs } = require('../categories');

const router = express.Router();

router.get('/config', (req, res) => {
  res.json({
    site_name: getConfig('site_name', 'Donate Stream'),
    google_enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    default_min_donation: Number(getConfig('default_min_donation', '1')),
    default_max_donation: Number(getConfig('default_max_donation', '1000')),
    // ซื้อ/ต่ออายุแพลนได้ไหม (มีบัญชีรับค่าแพลนแล้วหรือยัง: QR ของแอดมิน หรือ PROMPTPAY_ID)
    plan_payment: !!require('../planOrders').receiver(),
  });
});

// ตัวเลขภาพรวมสำหรับหน้าแรก (ไม่ใช่ข้อมูลส่วนตัว)
router.get('/stats', (req, res) => {
  const streamers = db.prepare("SELECT COUNT(*) c FROM users WHERE role IN ('streamer','admin') AND banned = 0").get().c;
  const d = db.prepare('SELECT COUNT(*) c FROM donations').get().c;
  const stickers = db.prepare('SELECT COUNT(*) c FROM stickers WHERE enabled = 1').get().c;
  res.json({ streamers, donations: d, stickers });
});

router.get('/streamers', (req, res) => {
  const rows = db.prepare(`SELECT u.id, u.username, u.display_name, u.avatar_url, u.cover_url, u.bio, u.creator_category, u.creator_subcategories, u.social_links,
      s.live_mode, s.stream_schedule, s.schedule_note, s.last_live_at
    FROM users u LEFT JOIN streamer_settings s ON s.user_id = u.id
    WHERE u.role IN ('streamer','admin') AND u.banned = 0 ORDER BY u.username`).all();
  res.json(rows.map(({ id, live_mode, stream_schedule, schedule_note, last_live_at, ...r }) => ({
    ...r, social_links: parseSocialLinks(r.social_links), creator_subcategories: parseSubs(r.creator_subcategories),
    live: live.publicView(id, { live_mode, stream_schedule, schedule_note, last_live_at }),
  })));
});

// ค่าที่หน้าโดเนทต้องรู้ล่วงหน้า (ไม่ใช่ข้อมูลลับ): ช่วงยอดโดเนท และเปิดรับคลิปเสียง/ไฟล์เพลงไหม
function donateConfig(userId) {
  const s = db.prepare('SELECT * FROM streamer_settings WHERE user_id = ?').get(userId) || {};
  return {
    min_donation: s.min_donation || 1,
    max_donation: s.max_donation || 1000,
    voice_msg_enabled: !!s.voice_msg_enabled,
    voice_msg_min_amount: s.voice_msg_min_amount || 5,
    voice_msg_max_sec: s.voice_msg_max_sec || 5,
    audio_msg_enabled: !!s.audio_msg_enabled,
    audio_msg_min_amount: s.audio_msg_min_amount || 1,
    audio_msg_max_sec: s.audio_msg_max_sec || 15,
    // ยังไม่มีแถวตั้งค่า (undefined) = เปิดตามค่าเริ่มต้น
    donations_enabled: s.donations_enabled !== 0,
    stickers_enabled: s.stickers_enabled !== 0,
  };
}

router.get('/streamer-donate-config', (req, res) => {
  const username = String(req.query.username || '').trim().toLowerCase();
  const u = db.prepare("SELECT id FROM users WHERE username = ? AND role IN ('streamer','admin')").get(username);
  if (!u) return res.status(404).json({ error: 'ไม่พบสตรีมเมอร์นี้' });
  res.json(donateConfig(u.id));
});

// หน้าโดเนทสาธารณะ /u/:username — โปรไฟล์ + ค่าที่ฟอร์มโดเนทต้องใช้ในคำขอเดียว
router.get('/u/:username', (req, res) => {
  const username = String(req.params.username || '').trim().toLowerCase();
  const u = db.prepare(`SELECT id, username, role, display_name, avatar_url, bio, creator_category, creator_subcategories, social_links, email_verified, created_at, plan_expires_at,
      promptpay_tag, promptpay_name
    FROM users WHERE username = ? AND role IN ('streamer','admin') AND banned = 0`).get(username);
  if (!u) return res.status(404).json({ error: 'ไม่พบสตรีมเมอร์นี้' });
  res.json({
    profile: {
      username: u.username, display_name: u.display_name || u.username, avatar_url: u.avatar_url || null,
      bio: u.bio || '', creator_category: u.creator_category || '', creator_subcategories: parseSubs(u.creator_subcategories),
      social_links: parseSocialLinks(u.social_links), verified: !!u.email_verified,
    },
    config: donateConfig(u.id),
    // แพลนหมดอายุ = ปิดรับโดเนทชั่วคราว (หน้าโดเนทแสดงข้อความแจ้ง)
    accepting: require('../plans').isActive(u),
    // ผู้ชมโอนผ่าน QR พร้อมเพย์ของสตรีมเมอร์ — ยังไม่ตั้ง QR = รับโดเนทไม่ได้
    qr_ready: !!u.promptpay_tag,
    account_name: u.promptpay_name || '',
    // กำลังไลฟ์อยู่ไหม + ตารางไลฟ์
    live: live.publicView(u.id),
  });
});

// สถานะไลฟ์อย่างเดียว — หน้าโดเนทดึงซ้ำเป็นระยะให้ป้าย "กำลังไลฟ์" อัปเดตเอง
router.get('/live/:username', (req, res) => {
  const username = String(req.params.username || '').trim().toLowerCase();
  const u = db.prepare("SELECT id FROM users WHERE username = ? AND role IN ('streamer','admin') AND banned = 0").get(username);
  if (!u) return res.status(404).json({ error: 'ไม่พบสตรีมเมอร์นี้' });
  res.json(live.publicView(u.id));
});

// รายการหมวดหมู่ครีเอเตอร์ + หมวดย่อย (src/categories.js) — แดชบอร์ดและหน้าสตรีมเมอร์ใช้ชุดเดียวกัน
router.get('/categories', (req, res) => res.json({ categories: CREATOR_CATEGORIES, max_subs: MAX_SUBS }));

router.get('/plans', (req, res) => {
  const { PLANS, TRIAL_DAYS } = require('../plans');
  res.json({ plans: PLANS, trial_days: TRIAL_DAYS });
});

router.get('/stickers', (req, res) => {
  res.json(db.prepare(`SELECT code, name, emoji, image_url, cost, animation
    FROM stickers WHERE enabled = 1 ORDER BY sort, id`).all());
});

router.get('/overlay/:key', (req, res) => {
  const u = db.prepare('SELECT id, username, display_name FROM users WHERE overlay_key = ?').get(req.params.key);
  if (!u) return res.status(404).json({ error: 'overlay key ไม่ถูกต้อง' });
  const s = db.prepare('SELECT * FROM streamer_settings WHERE user_id = ?').get(u.id) || {};
  res.json({
    streamer: { username: u.username, display_name: u.display_name },
    settings: {
      accent: s.accent_color || '#ffffff',
      text: s.text_color || '#ffffff',
      bg: s.bg_color || 'transparent',
      duration: s.alert_duration_ms || 8000,
      sound: s.sound_enabled !== 0,
      tts: !!s.tts_enabled,
      tts_lang: s.tts_lang || 'th-TH',
    },
  });
});

// นับการเข้าชมหน้าโดเนทของสตรีมเมอร์ — ใช้เป็นตัวเลข "ผู้เข้าชม" ในหน้าสถิติของสตรีมเมอร์
router.post('/streamer-view', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const u = db.prepare("SELECT id FROM users WHERE username = ? AND role IN ('streamer','admin')").get(username);
  if (!u) return res.status(404).json({ error: 'ไม่พบสตรีมเมอร์นี้' });
  db.prepare('INSERT INTO page_views (streamer_user_id, created_at) VALUES (?, ?)').run(u.id, now());
  res.json({ ok: true });
});

module.exports = router;
