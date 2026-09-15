const express = require('express');
const { db, getConfig } = require('../db');
const { requireAuth, requireVerified } = require('../auth');
const ledger = require('../ledger');
const { now, clean } = require('../util');

const router = express.Router();
router.use(requireAuth);

const DEFAULT_SETTINGS = {
  alert_duration_ms: 8000, min_alert_amount: 1, sound_enabled: 1, tts_enabled: 0, tts_lang: 'th-TH',
  accent_color: '#ffffff', text_color: '#ffffff', bg_color: 'rgba(10,10,11,0.92)',
  title_template: '{name} โดเนท {amount}฿', min_donation: 1, max_donation: 1000,
};

function getSticker(code) {
  if (!code) return null;
  return db.prepare('SELECT * FROM stickers WHERE code = ? AND enabled = 1').get(String(code)) || null;
}

function buildPayload(streamerId, st, { amount, display_name, message, sticker, test }) {
  const title = (st.title_template || '{name} โดเนท {amount}฿')
    .replace('{name}', display_name).replace('{amount}', amount);
  return {
    id: 0, amount, display_name, message,
    sticker: sticker ? { code: sticker.code, emoji: sticker.emoji, image_url: sticker.image_url, animation: sticker.animation } : null,
    settings: {
      duration: st.alert_duration_ms, accent: st.accent_color, text: st.text_color, bg: st.bg_color,
      title, sound: !!st.sound_enabled, tts: !!st.tts_enabled, tts_lang: st.tts_lang,
      show: amount >= (st.min_alert_amount || 1),
    },
    test: !!test, created_at: Date.now(),
  };
}

router.post('/', requireVerified, (req, res) => {
  const streamerName = String(req.body.streamer || '').trim().toLowerCase();
  const display_name = clean(req.body.display_name || req.user.display_name || req.user.username, 40);
  const message = clean(req.body.message || '', 200);
  const stickerCode = req.body.sticker_code ? String(req.body.sticker_code) : null;
  const stickerOnly = !!req.body.sticker_only;

  const streamer = db.prepare("SELECT * FROM users WHERE username = ? AND role IN ('streamer','admin')").get(streamerName);
  if (!streamer) return res.status(404).json({ error: 'ไม่พบสตรีมเมอร์นี้' });
  if (streamer.id === req.user.id) return res.status(400).json({ error: 'โดเนทให้ตัวเองไม่ได้' });
  if (streamer.banned) return res.status(403).json({ error: 'สตรีมเมอร์รายนี้ถูกระงับ' });

  const st = { ...DEFAULT_SETTINGS, ...(db.prepare('SELECT * FROM streamer_settings WHERE user_id = ?').get(streamer.id) || {}) };

  const sticker = getSticker(stickerCode);
  if (stickerCode && !sticker) return res.status(400).json({ error: 'สติกเกอร์ไม่ถูกต้องหรือถูกปิดใช้งาน' });

  // ส่งสติกเกอร์แบบคลิกเดียว — ราคาคงที่ของสติกเกอร์เอง ไม่ต้องกรอกจำนวนเงินเพิ่ม
  let amount, stickerCost;
  if (stickerOnly) {
    if (!sticker) return res.status(400).json({ error: 'กรุณาเลือกสติกเกอร์' });
    amount = sticker.cost;
    stickerCost = 0;
  } else {
    amount = Math.floor(Number(req.body.amount));
    const minD = st.min_donation || 1, maxD = st.max_donation || 1000;
    if (!Number.isFinite(amount) || amount < minD || amount > maxD) {
      return res.status(400).json({ error: `จำนวนเงินต้องอยู่ระหว่าง ${minD} - ${maxD} บาท` });
    }
    stickerCost = sticker ? sticker.cost : 0;
  }
  const total = amount + stickerCost;

  const feePct = Number(getConfig('platform_fee_percent', '0')) || 0;
  const fee = Math.round((total * feePct) / 100);
  const credit = total - fee;

  let result;
  try {
    result = db.transaction(() => {
      const info = db.prepare(`INSERT INTO donations
        (donor_user_id, streamer_user_id, amount, display_name, message, sticker_code, sticker_cost, streamer_credit, platform_fee, total_cost, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        req.user.id, streamer.id, amount, display_name, message, stickerCode, stickerCost, credit, fee, total, now());

      const { fromBalance } = ledger.transfer({
        fromUserId: req.user.id, fromField: 'token_balance', fromAmount: total,
        fromType: 'donation_sent', fromNote: `โดเนทให้ @${streamer.username}`,
        toUserId: streamer.id, toField: 'earnings_balance', toAmount: credit,
        toType: 'donation_received', toNote: `รับโดเนทจาก ${display_name}`,
        refType: 'donation', refId: info.lastInsertRowid,
      });
      return { id: info.lastInsertRowid, donorBal: fromBalance };
    })();
  } catch (e) {
    if (e.code === 'INSUFFICIENT_BALANCE') return res.status(400).json({ error: `ยอด Token ไม่พอ (ต้องใช้ ${total}) กรุณาเติมเงิน` });
    console.error(e);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการโดเนท' });
  }

  const payload = buildPayload(streamer.id, st, { amount, display_name, message, sticker });
  payload.id = result.id;
  req.app.get('io').to('stream:' + streamer.id).emit('donation', payload);

  res.json({ ok: true, donation_id: result.id, balance: result.donorBal });
});

router.get('/sent', (req, res) => {
  res.json(db.prepare(`SELECT d.*, u.username AS streamer_username
    FROM donations d JOIN users u ON u.id = d.streamer_user_id
    WHERE d.donor_user_id = ? ORDER BY d.id DESC LIMIT 50`).all(req.user.id));
});

module.exports = router;
