const express = require('express');
const { db } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const ledger = require('../ledger');
const { token, now, clean, clampInt } = require('../util');

const router = express.Router();
router.use(requireAuth, requireRole('streamer', 'admin'));

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

router.get('/settings', (req, res) => {
  const settings = ensureSettings(req.user.id);
  const key = ensureOverlayKey(req.user);
  res.json({ settings, overlay_key: key, overlay_url: `/overlay/${key}` });
});

router.put('/settings', (req, res) => {
  ensureSettings(req.user.id);
  const b = req.body;
  const f = {
    alert_duration_ms: clampInt(b.alert_duration_ms, 2000, 30000, 8000),
    min_alert_amount: clampInt(b.min_alert_amount, 0, 100000, 1),
    sound_enabled: b.sound_enabled ? 1 : 0,
    tts_enabled: b.tts_enabled ? 1 : 0,
    tts_lang: clean(b.tts_lang || 'th-TH', 12),
    accent_color: clean(b.accent_color || '#ffffff', 30),
    text_color: clean(b.text_color || '#ffffff', 30),
    bg_color: clean(b.bg_color || 'rgba(10,10,11,0.92)', 40),
    title_template: clean(b.title_template || '{name} โดเนท {amount}฿', 120),
    min_donation: clampInt(b.min_donation, 1, 100000, 1),
    max_donation: clampInt(b.max_donation, 1, 1000000, 1000),
    uid: req.user.id,
  };
  db.prepare(`UPDATE streamer_settings SET
    alert_duration_ms=@alert_duration_ms, min_alert_amount=@min_alert_amount, sound_enabled=@sound_enabled,
    tts_enabled=@tts_enabled, tts_lang=@tts_lang, accent_color=@accent_color, text_color=@text_color,
    bg_color=@bg_color, title_template=@title_template, min_donation=@min_donation, max_donation=@max_donation,
    updated_at=${now()} WHERE user_id=@uid`).run(f);
  res.json({ ok: true, settings: db.prepare('SELECT * FROM streamer_settings WHERE user_id = ?').get(req.user.id) });
});

router.post('/overlay/rotate', (req, res) => {
  const key = token(20);
  db.prepare('UPDATE users SET overlay_key = ? WHERE id = ?').run(key, req.user.id);
  res.json({ ok: true, overlay_key: key, overlay_url: `/overlay/${key}` });
});

router.post('/test-alert', (req, res) => {
  const s = ensureSettings(req.user.id);
  const amount = clampInt(req.body.amount, 1, 100000, 99);
  const display_name = clean(req.body.display_name || 'ทดสอบระบบ', 40);
  const message = clean(req.body.message || 'นี่คือข้อความทดสอบการแจ้งเตือนโดเนท 🎉', 200);
  const sticker = req.body.sticker_code
    ? db.prepare('SELECT * FROM stickers WHERE code = ?').get(String(req.body.sticker_code))
    : null;

  const title = (s.title_template || '{name} โดเนท {amount}฿').replace('{name}', display_name).replace('{amount}', amount);
  req.app.get('io').to('stream:' + req.user.id).emit('donation', {
    id: 0, amount, display_name, message,
    sticker: sticker ? { code: sticker.code, emoji: sticker.emoji, image_url: sticker.image_url, animation: sticker.animation } : null,
    settings: {
      duration: s.alert_duration_ms, accent: s.accent_color, text: s.text_color, bg: s.bg_color,
      title, sound: !!s.sound_enabled, tts: !!s.tts_enabled, tts_lang: s.tts_lang, show: true,
    },
    test: true, created_at: Date.now(),
  });
  res.json({ ok: true });
});

router.get('/summary', (req, res) => {
  const agg = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(streamer_credit),0) AS total
    FROM donations WHERE streamer_user_id = ?`).get(req.user.id);
  const recent = db.prepare(`SELECT id, amount, display_name, message, sticker_code, streamer_credit, created_at
    FROM donations WHERE streamer_user_id = ? ORDER BY id DESC LIMIT 50`).all(req.user.id);
  const top = db.prepare(`SELECT display_name, SUM(amount) AS total FROM donations
    WHERE streamer_user_id = ? GROUP BY display_name ORDER BY total DESC LIMIT 5`).all(req.user.id);
  const u = db.prepare('SELECT earnings_balance FROM users WHERE id = ?').get(req.user.id);
  res.json({ earnings: u.earnings_balance, count: agg.count, total: agg.total, recent, top });
});

router.get('/analytics', (req, res) => {
  const days = clampInt(req.query.days, 7, 90, 14);
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

  const lifetime = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(streamer_credit), 0) AS total
    FROM donations WHERE streamer_user_id = ?`).get(req.user.id);

  const topDonors = db.prepare(`
    SELECT COALESCE(u.display_name, d.display_name) AS display_name, u.username AS username,
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
    },
    trend,
    top_donors: topDonors,
  });
});

router.post('/payout', (req, res) => {
  const amount = clampInt(req.body.amount, 0, 100000000, 0);
  const method = clean(req.body.method || 'bank', 20);
  const account_detail = clean(req.body.account_detail || '', 200);
  if (amount < 100) return res.status(400).json({ error: 'ถอนขั้นต่ำ 100 บาท' });

  try {
    db.transaction(() => {
      const info = db.prepare(`INSERT INTO payouts (user_id, amount, method, account_detail, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', ?)`).run(req.user.id, amount, method, account_detail, now());
      ledger.debit(req.user.id, 'earnings_balance', amount, 'withdraw', 'payout', info.lastInsertRowid, 'ขอถอนเงิน');
    })();
  } catch (e) {
    if (e.code === 'INSUFFICIENT_BALANCE') return res.status(400).json({ error: 'ยอดรายได้คงเหลือไม่พอ' });
    throw e;
  }
  res.json({ ok: true });
});

router.get('/payouts', (req, res) => {
  res.json(db.prepare('SELECT * FROM payouts WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id));
});

module.exports = router;
