const fs = require('fs');
const path = require('path');
const express = require('express');
const { db } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { token, now, clean, clampInt, buildTitle, resolveTts } = require('../util');
const { getActiveTier } = require('../tiers');
const tts = require('../tts');
const plans = require('../plans');
const live = require('../live');
const promptpay = require('../promptpay');
const slipVerify = require('../slipVerify');

const router = express.Router();
router.use(requireAuth, requireRole('streamer', 'admin'));

const { uploadDir, removeUpload } = require('../config');
const SOUND_DIR = uploadDir('sounds');
const GIF_DIR = uploadDir('gifs');

function ensureSettings(uid) {
  db.prepare('INSERT OR IGNORE INTO streamer_settings (user_id, updated_at) VALUES (?, ?)').run(uid, now());
  return db.prepare('SELECT * FROM streamer_settings WHERE user_id = ?').get(uid);
}

function ensureOverlayKey(user) {
  if (user.overlay_key) return user.overlay_key;
  const key = token(20);
  db.prepare('UPDATE users SET overlay_key = ? WHERE id = ?').run(key, user.id);
  return key;
}

// ลบไฟล์อัปโหลดเดิมเมื่อแทนที่ด้วยไฟล์ใหม่ หรือเมื่อผู้ใช้สั่งลบ — กันไฟล์ขยะสะสมบนดิสก์
function unlinkUpload(relUrl) {
  removeUpload(relUrl);
}

router.get('/settings', (req, res) => {
  const settings = ensureSettings(req.user.id);
  const key = ensureOverlayKey(req.user);
  res.json({ settings, overlay_key: key, overlay_url: `/overlay/${key}`, ai_voices: tts.AI_VOICES, ai_tts_configured: tts.isConfigured() });
});

router.put('/settings', (req, res) => {
  // อัปเดตแบบ merge กับค่าเดิม — หน้าแดชบอร์ดแยกฟอร์มบันทึกเป็นหลายการ์ด (โดเนทขั้นต่ำ-สูงสุด / Overlay)
  // ส่งมาแค่บางฟิลด์ต่อครั้ง ฟิลด์ที่ไม่ได้ส่งมาต้องคงค่าเดิมไว้ ไม่ใช่รีเซ็ตเป็นค่า default
  const current = ensureSettings(req.user.id);
  const b = req.body;
  const pick = (key) => (b[key] !== undefined ? b[key] : current[key]);
  const f = {
    alert_duration_ms: clampInt(pick('alert_duration_ms'), 10000, 60000, current.alert_duration_ms),
    min_alert_amount: clampInt(pick('min_alert_amount'), 0, 100000, current.min_alert_amount),
    sound_enabled: pick('sound_enabled') ? 1 : 0,
    tts_enabled: pick('tts_enabled') ? 1 : 0,
    tts_lang: clean(pick('tts_lang') || 'th-TH', 12),
    tts_min_amount_enabled: pick('tts_min_amount_enabled') ? 1 : 0,
    tts_min_amount: clampInt(pick('tts_min_amount'), 1, 1000000, current.tts_min_amount),
    tts_read_symbols: pick('tts_read_symbols') ? 1 : 0,
    tts_persist_after_hide: pick('tts_persist_after_hide') ? 1 : 0,
    accent_color: clean(pick('accent_color') || '#ffffff', 30),
    text_color: clean(pick('text_color') || '#ffffff', 30),
    bg_color: clean(pick('bg_color') || 'transparent', 40),
    connector_color: clean(pick('connector_color') || '#ffffff', 30),
    title_template: clean(pick('title_template') || '{name} โดเนท {amount}{currency}', 120),
    min_donation: clampInt(pick('min_donation'), 1, 100000, current.min_donation),
    max_donation: clampInt(pick('max_donation'), 1, 1000000, current.max_donation),
    show_currency: pick('show_currency') ? 1 : 0,
    word_filter: clean(pick('word_filter') || '', 100),
    tts_voice_name: clean(pick('tts_voice_name') || '', 100),
    tts_engine: pick('tts_engine') === 'ai' ? 'ai' : 'browser',
    tts_ai_voice: tts.voiceOrDefault(pick('tts_ai_voice')),
    gif_enabled: pick('gif_enabled') ? 1 : 0,
    gif_min_amount: clampInt(pick('gif_min_amount'), 0, 1000000, current.gif_min_amount),
    voice_msg_enabled: pick('voice_msg_enabled') ? 1 : 0,
    voice_msg_min_amount: clampInt(pick('voice_msg_min_amount'), 1, 1000000, current.voice_msg_min_amount),
    voice_msg_max_sec: clampInt(pick('voice_msg_max_sec'), 3, 15, current.voice_msg_max_sec),
    audio_msg_enabled: pick('audio_msg_enabled') ? 1 : 0,
    audio_msg_min_amount: clampInt(pick('audio_msg_min_amount'), 1, 1000000, current.audio_msg_min_amount),
    audio_msg_max_sec: clampInt(pick('audio_msg_max_sec'), 3, 30, current.audio_msg_max_sec),
    gif_size: ['small', 'medium', 'large'].includes(pick('gif_size')) ? pick('gif_size') : 'large',
    donations_enabled: pick('donations_enabled') ? 1 : 0,
    stickers_enabled: pick('stickers_enabled') ? 1 : 0,
    uid: req.user.id,
  };
  db.prepare(`UPDATE streamer_settings SET
    alert_duration_ms=@alert_duration_ms, min_alert_amount=@min_alert_amount, sound_enabled=@sound_enabled,
    tts_enabled=@tts_enabled, tts_lang=@tts_lang, accent_color=@accent_color, text_color=@text_color,
    bg_color=@bg_color, connector_color=@connector_color, title_template=@title_template,
    tts_min_amount_enabled=@tts_min_amount_enabled, tts_min_amount=@tts_min_amount,
    tts_read_symbols=@tts_read_symbols, tts_persist_after_hide=@tts_persist_after_hide,
    min_donation=@min_donation, max_donation=@max_donation,
    show_currency=@show_currency, word_filter=@word_filter, tts_voice_name=@tts_voice_name,
    tts_engine=@tts_engine, tts_ai_voice=@tts_ai_voice,
    gif_enabled=@gif_enabled, gif_min_amount=@gif_min_amount,
    voice_msg_enabled=@voice_msg_enabled, voice_msg_min_amount=@voice_msg_min_amount, voice_msg_max_sec=@voice_msg_max_sec,
    audio_msg_enabled=@audio_msg_enabled, audio_msg_min_amount=@audio_msg_min_amount, audio_msg_max_sec=@audio_msg_max_sec,
    donations_enabled=@donations_enabled, stickers_enabled=@stickers_enabled, gif_size=@gif_size,
    updated_at=${now()} WHERE user_id=@uid`).run(f);
  res.json({ ok: true, settings: db.prepare('SELECT * FROM streamer_settings WHERE user_id = ?').get(req.user.id) });
});

router.post('/overlay/sound', (req, res) => {
  const data = String(req.body.sound || '');
  const m = /^data:audio\/(mpeg|mp3|wav|ogg|webm);base64,([a-zA-Z0-9+/=]+)$/.exec(data);
  if (!m) return res.status(400).json({ error: 'ไฟล์เสียงไม่ถูกต้อง (รองรับ MP3, WAV, OGG)' });

  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 2 * 1024 * 1024) return res.status(400).json({ error: 'ไฟล์ใหญ่เกินไป (สูงสุด 2MB)' });

  const ext = m[1] === 'mpeg' ? 'mp3' : m[1];
  const filename = `u${req.user.id}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(SOUND_DIR, filename), buf);
  const url = '/uploads/sounds/' + filename;

  const current = ensureSettings(req.user.id);
  db.prepare('UPDATE streamer_settings SET custom_sound_url = ? WHERE user_id = ?').run(url, req.user.id);
  unlinkUpload(current.custom_sound_url);
  res.json({ ok: true, custom_sound_url: url });
});

router.delete('/overlay/sound', (req, res) => {
  const current = ensureSettings(req.user.id);
  unlinkUpload(current.custom_sound_url);
  db.prepare('UPDATE streamer_settings SET custom_sound_url = NULL WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

// รูป/GIF ที่แสดงเหนือแจ้งเตือนบน Overlay (ชื่อ route/คอลัมน์ยังเป็น gif เพื่อไม่ต้องย้ายข้อมูลเดิม)
router.post('/overlay/gif', (req, res) => {
  const data = String(req.body.gif || '');
  const m = /^data:image\/(gif|png|jpe?g|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(data);
  if (!m) return res.status(400).json({ error: 'ไฟล์ไม่ถูกต้อง (รองรับ PNG, JPG, WEBP, GIF)' });

  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'ไฟล์ใหญ่เกินไป (สูงสุด 5MB)' });

  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const filename = `u${req.user.id}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(GIF_DIR, filename), buf);
  const url = '/uploads/gifs/' + filename;

  const current = ensureSettings(req.user.id);
  db.prepare('UPDATE streamer_settings SET custom_gif_url = ? WHERE user_id = ?').run(url, req.user.id);
  unlinkUpload(current.custom_gif_url);
  res.json({ ok: true, custom_gif_url: url });
});

router.delete('/overlay/gif', (req, res) => {
  const current = ensureSettings(req.user.id);
  unlinkUpload(current.custom_gif_url);
  db.prepare('UPDATE streamer_settings SET custom_gif_url = NULL WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

// ---------- แจ้งเตือนที่กำหนดเองตามจำนวนเงินที่ได้รับ ----------
router.get('/tiers', (req, res) => {
  res.json(db.prepare('SELECT * FROM notification_tiers WHERE user_id = ? ORDER BY min_amount ASC').all(req.user.id));
});

router.post('/tiers', (req, res) => {
  const min_amount = clampInt(req.body.min_amount, 1, 1000000, 100);
  const info = db.prepare(`INSERT INTO notification_tiers (user_id, min_amount, tts_enabled, sound_enabled, gif_enabled, sort)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    req.user.id, min_amount,
    req.body.tts_enabled ? 1 : 0, req.body.sound_enabled ? 1 : 0, req.body.gif_enabled ? 1 : 0, min_amount);
  res.json(db.prepare('SELECT * FROM notification_tiers WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/tiers/:id', (req, res) => {
  db.prepare('DELETE FROM notification_tiers WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// สถานะไลฟ์ + ตารางไลฟ์ (แสดงบนหน้าโดเนทและหน้าสตรีมเมอร์)
router.get('/live', (req, res) => {
  ensureSettings(req.user.id);
  res.json(live.ownerView(req.user.id));
});

router.put('/live', (req, res) => {
  ensureSettings(req.user.id);
  res.json({ ok: true, ...live.saveSettings(req.user.id, req.body || {}) });
});

router.post('/overlay/rotate', (req, res) => {
  const key = token(20);
  db.prepare('UPDATE users SET overlay_key = ? WHERE id = ?').run(key, req.user.id);
  res.json({ ok: true, overlay_key: key, overlay_url: `/overlay/${key}` });
});

router.post('/test-alert', async (req, res) => {
  if (!plans.isActive(req.user)) return res.status(403).json({ error: 'แพลนหมดอายุ — ต่ออายุแพลนก่อนจึงจะแจ้งเตือนบน Overlay ได้' });
  const s = ensureSettings(req.user.id);
  const amount = clampInt(req.body.amount, 1, 100000, 99);
  const display_name = clean(req.body.display_name || 'ทดสอบระบบ', 40);
  const message = clean(req.body.message || 'นี่คือข้อความทดสอบการแจ้งเตือนโดเนท 🎉', 200);
  const sticker = req.body.sticker_code
    ? db.prepare('SELECT * FROM stickers WHERE code = ?').get(String(req.body.sticker_code))
    : null;

  const title = buildTitle(s.title_template, display_name, amount, !!s.show_currency);

  const tier = getActiveTier(req.user.id, amount);
  const showGif = tier ? !!tier.gif_enabled : (!!s.gif_enabled && amount >= s.gif_min_amount);

  const payload = {
    id: 0, amount, display_name, message,
    sticker: sticker ? { code: sticker.code, name: sticker.name, emoji: sticker.emoji, image_url: sticker.image_url, animation: sticker.animation } : null,
    settings: {
      duration: s.alert_duration_ms, accent: s.accent_color, text: s.text_color, bg: s.bg_color,
      connector: s.connector_color || '#ffffff', title_template: s.title_template || '{name} โดเนท {amount}{currency}',
      show_currency: !!s.show_currency,
      title, sound: tier ? !!tier.sound_enabled : !!s.sound_enabled,
      tts: resolveTts(s, tier ? !!tier.tts_enabled : !!s.tts_enabled, amount),
      tts_lang: s.tts_lang, tts_voice_name: s.tts_voice_name || '',
      tts_read_symbols: !!s.tts_read_symbols, tts_persist_after_hide: !!s.tts_persist_after_hide,
      custom_sound_url: s.custom_sound_url || '', gif_url: showGif ? (s.custom_gif_url || '') : '', gif_size: s.gif_size || 'large',
      show: true,
    },
    test: true, created_at: Date.now(),
  };
  await tts.attachAiVoice(payload, s);
  req.app.get('io').to('stream:' + req.user.id).emit('donation', payload);
  res.json({ ok: true, ai_voice: s.tts_engine === 'ai' ? !!payload.settings.tts_url : undefined });
});

// ลองฟังเสียง AI จากหน้าตั้งค่า (ไม่ส่งไป Overlay)
router.post('/tts/preview', async (req, res) => {
  if (!tts.isConfigured()) return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่า GOOGLE_TTS_API_KEY ใน .env' });
  const url = await tts.synthesize('สวัสดีครับ ขอบคุณสำหรับการสนับสนุนนะครับ', req.body.voice);
  if (!url) return res.status(502).json({ error: 'สร้างเสียง AI ไม่สำเร็จ ตรวจสอบ API key หรือดูข้อความในคอนโซลเซิร์ฟเวอร์' });
  res.json({ ok: true, url });
});

router.get('/summary', (req, res) => {
  const agg = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(streamer_credit),0) AS total
    FROM donations WHERE streamer_user_id = ?`).get(req.user.id);
  const recent = db.prepare(`SELECT id, amount, display_name, message, sticker_code, streamer_credit, voice_url, audio_url, created_at
    FROM donations WHERE streamer_user_id = ? ORDER BY id DESC LIMIT 50`).all(req.user.id);
  const top = db.prepare(`SELECT display_name, SUM(amount) AS total FROM donations
    WHERE streamer_user_id = ? GROUP BY display_name ORDER BY total DESC LIMIT 5`).all(req.user.id);
  res.json({ count: agg.count, total: agg.total, recent, top });
});

router.get('/transactions', (req, res) => {
  res.json(db.prepare(`SELECT id, amount, display_name, message, sticker_code, streamer_credit, voice_url, audio_url, created_at
    FROM donations WHERE streamer_user_id = ? ORDER BY id DESC LIMIT 200`).all(req.user.id));
});

router.get('/supporters', (req, res) => {
  res.json(db.prepare(`
    SELECT COALESCE(u.display_name, d.display_name) AS display_name, u.username AS username,
           CASE WHEN (SELECT d2.hide_email FROM donations d2
                      WHERE d2.streamer_user_id = d.streamer_user_id AND d2.donor_user_id = d.donor_user_id
                      ORDER BY d2.id DESC LIMIT 1) = 1 THEN NULL ELSE u.email END AS email,
           SUM(d.amount) AS total, COUNT(*) AS count
    FROM donations d LEFT JOIN users u ON u.id = d.donor_user_id
    WHERE d.streamer_user_id = ?
    -- ผู้ชมที่โดเนทผ่าน QR โดยไม่ล็อกอิน (ไม่มีบัญชี) แยกกลุ่มตามชื่อที่ใส่
    GROUP BY CASE WHEN d.donor_user_id IS NULL THEN 'g:' || d.display_name ELSE 'u:' || d.donor_user_id END
    ORDER BY total DESC LIMIT 200`).all(req.user.id));
});

router.get('/analytics', (req, res) => {
  const days = clampInt(req.query.days, 1, 90, 14);
  const since = now() - days * 24 * 3600 * 1000;

  const donRows = db.prepare(`SELECT date(created_at/1000, 'unixepoch') AS d,
      COUNT(*) AS donations, COALESCE(SUM(streamer_credit), 0) AS revenue
    FROM donations WHERE streamer_user_id = ? AND created_at >= ?
    GROUP BY d`).all(req.user.id, since);
  const viewRows = db.prepare(`SELECT date(created_at/1000, 'unixepoch') AS d, COUNT(*) AS views
    FROM page_views WHERE streamer_user_id = ? AND created_at >= ?
    GROUP BY d`).all(req.user.id, since);

  const donMap = Object.fromEntries(donRows.map((r) => [r.d, r]));
  const viewMap = Object.fromEntries(viewRows.map((r) => [r.d, r.views]));

  const trend = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
    trend.push({
      date: d,
      revenue: (donMap[d] && donMap[d].revenue) || 0,
      donations: (donMap[d] && donMap[d].donations) || 0,
      views: viewMap[d] || 0,
    });
  }

  const periodRevenue = trend.reduce((a, t) => a + t.revenue, 0);
  const periodDonations = trend.reduce((a, t) => a + t.donations, 0);
  const periodViews = trend.reduce((a, t) => a + t.views, 0);
  const rate = periodViews > 0 ? (periodDonations / periodViews) * 100 : 0;
  const avgPeriod = periodDonations > 0 ? Math.round(periodRevenue / periodDonations) : 0;

  const lifetime = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(streamer_credit), 0) AS total
    FROM donations WHERE streamer_user_id = ?`).get(req.user.id);

  const supportersPeriod = db.prepare(`SELECT COUNT(DISTINCT donor_user_id) AS n
    FROM donations WHERE streamer_user_id = ? AND created_at >= ?`).get(req.user.id, since).n;

  const topDonors = db.prepare(`
    SELECT COALESCE(u.display_name, d.display_name) AS display_name, u.username AS username,
           CASE WHEN (SELECT d2.hide_email FROM donations d2
                      WHERE d2.streamer_user_id = d.streamer_user_id AND d2.donor_user_id = d.donor_user_id
                      ORDER BY d2.id DESC LIMIT 1) = 1 THEN NULL ELSE u.email END AS email,
           SUM(d.amount) AS total, COUNT(*) AS count
    FROM donations d LEFT JOIN users u ON u.id = d.donor_user_id
    WHERE d.streamer_user_id = ?
    GROUP BY d.donor_user_id
    ORDER BY total DESC LIMIT 20`).all(req.user.id);

  res.json({
    range_days: days,
    totals: {
      revenue_period: periodRevenue,
      donations_period: periodDonations,
      views_period: periodViews,
      rate_period: Math.round(rate * 10) / 10,
      revenue_lifetime: lifetime.total,
      donations_lifetime: lifetime.count,
      supporters_period: supportersPeriod,
      avg_period: avgPeriod,
    },
    trend,
    top_donors: topDonors,
  });
});

// ---------- QR พร้อมเพย์รับโดเนท (ผู้ชมโอนตรงเข้าบัญชีนี้) ----------
function promptpayView(u) {
  const target = u.promptpay_tag ? { tag: u.promptpay_tag, value: u.promptpay_value } : null;
  return {
    enabled: !!target, number: promptpay.display(target), type: target ? target.tag : null,
    name: u.promptpay_name || '', bank_account: u.promptpay_bank_account || '', auto_check: slipVerify.enabled(),
    // QR รับเงินของบัญชีนี้ (ไม่ระบุยอด) ให้สตรีมเมอร์เห็นว่าตั้งค่าแล้ว/สแกนทดสอบได้
    qr: target ? promptpay.payloadFor(target, null) : null,
  };
}

router.get('/promptpay', (req, res) => res.json(promptpayView(req.user)));

// รับได้ 2 แบบ: qr_payload = ข้อความที่หน้าเว็บอ่านจากรูป QR รับเงิน / number = หมายเลขพร้อมเพย์ที่พิมพ์เอง
router.put('/promptpay', (req, res) => {
  let target;
  if (req.body.qr_payload) {
    const r = promptpay.decode(req.body.qr_payload);
    if (r.error) return res.status(400).json({ error: r.error });
    target = r.target;
  } else {
    target = promptpay.parseTarget(req.body.number);
    if (!target) return res.status(400).json({ error: 'หมายเลขพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก, เลขบัตรประชาชน 13 หลัก หรือ e-Wallet ID 15 หลัก' });
  }
  const name = clean(req.body.name || '', 60);
  if (!name) return res.status(400).json({ error: 'กรุณาใส่ชื่อบัญชี (ให้ผู้ชมเช็คก่อนโอน)' });
  const bank = String(req.body.bank_account || '').replace(/\D/g, '');
  if (bank && (bank.length < 10 || bank.length > 15)) return res.status(400).json({ error: 'เลขบัญชีธนาคารต้องเป็นตัวเลข 10-15 หลัก' });
  db.prepare('UPDATE users SET promptpay_tag = ?, promptpay_value = ?, promptpay_name = ?, promptpay_bank_account = ? WHERE id = ?')
    .run(target.tag, target.value, name, bank || null, req.user.id);
  res.json({ ok: true, ...promptpayView(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

router.delete('/promptpay', (req, res) => {
  db.prepare('UPDATE users SET promptpay_tag = NULL, promptpay_value = NULL, promptpay_name = NULL, promptpay_bank_account = NULL WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
