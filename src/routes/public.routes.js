const express = require('express');
const { db, getConfig } = require('../db');
const { now } = require('../util');

const router = express.Router();

router.get('/config', (req, res) => {
  let pkgs;
  try { pkgs = JSON.parse(getConfig('topup_packages', '[20,50,100,300,500,1000]')); }
  catch { pkgs = [20, 50, 100, 300, 500, 1000]; }
  res.json({
    site_name: getConfig('site_name', 'Donate Stream'),
    google_enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    default_min_donation: Number(getConfig('default_min_donation', '1')),
    default_max_donation: Number(getConfig('default_max_donation', '1000')),
    topup_packages: pkgs,
  });
});

router.get('/streamers', (req, res) => {
  res.json(db.prepare(`SELECT username, display_name, avatar_url FROM users
    WHERE role IN ('streamer','admin') AND banned = 0 ORDER BY username`).all());
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
      bg: s.bg_color || 'rgba(10,10,11,0.92)',
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
