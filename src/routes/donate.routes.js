const fs = require('fs');
const path = require('path');
const express = require('express');
const { db, getConfig } = require('../db');
const { requireAuth, requireVerified } = require('../auth');
const ledger = require('../ledger');
const { now, clean, buildTitle, resolveTts } = require('../util');
const { getActiveTier } = require('../tiers');
const tts = require('../tts');
const plans = require('../plans');
const notify = require('../notify');

const router = express.Router();
router.use(requireAuth);

const MEDIA_DIR = require('../config').uploadDir('donation-media');

const DEFAULT_SETTINGS = {
  alert_duration_ms: 8000, min_alert_amount: 1, sound_enabled: 1, tts_enabled: 0, tts_lang: 'th-TH',
  accent_color: '#ffffff', text_color: '#ffffff', bg_color: 'transparent', connector_color: '#ffffff',
  title_template: '{name} โดเนท {amount}{currency}', min_donation: 1, max_donation: 1000,
  show_currency: 1, word_filter: '', custom_sound_url: '', custom_gif_url: '',
  gif_enabled: 0, gif_min_amount: 0, tts_voice_name: '',
  voice_msg_enabled: 0, voice_msg_min_amount: 5, voice_msg_max_sec: 5,
  audio_msg_enabled: 0, audio_msg_min_amount: 1, audio_msg_max_sec: 15,
  tts_min_amount_enabled: 0, tts_min_amount: 1, tts_read_symbols: 1,
  tts_persist_after_hide: 1, tts_engine: 'browser', tts_ai_voice: tts.DEFAULT_VOICE,
};

// ผู้สนับสนุนแนบคลิปเสียง/ไฟล์เพลงมากับการโดเนท — บันทึกไฟล์ก็ต่อเมื่อสตรีมเมอร์เปิดใช้ฟีเจอร์นี้และยอดเงินถึงขั้นต่ำที่ตั้งไว้
// (เงื่อนไขไม่ผ่าน = เงียบ ๆ ไม่แนบไฟล์ ไม่ทำให้การโดเนทล้มเหลว เพราะไฟล์เสียงเป็นส่วนเสริม ไม่ใช่ตัวธุรกรรมหลัก)
function saveMediaClip(dataUrl, { maxBytes, allowedExt }) {
  // MediaRecorder มักส่งมาเป็น "data:audio/webm;codecs=opus;base64,..." ต้องรองรับพารามิเตอร์ codecs ด้วย
  const m = /^data:audio\/([a-z0-9]+)(?:;codecs=[^;]+)?;base64,([a-zA-Z0-9+/=]+)$/i.exec(String(dataUrl || ''));
  if (!m) return null;
  const ext = m[1].toLowerCase() === 'mpeg' ? 'mp3' : m[1].toLowerCase();
  if (!allowedExt.includes(ext)) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > maxBytes) return null;
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, filename), buf);
  return '/uploads/donation-media/' + filename;
}

function getSticker(code) {
  if (!code) return null;
  return db.prepare('SELECT * FROM stickers WHERE code = ? AND enabled = 1').get(String(code)) || null;
}

// ซ่อนป๊อปอัพแจ้งเตือนถ้าชื่อ/ข้อความมีคำที่สตรีมเมอร์ตั้งเป็นคำต้องห้าม (เงินยังเข้าปกติ แค่ไม่ขึ้นแจ้งเตือน)
function isFiltered(wordFilter, display_name, message) {
  const words = String(wordFilter || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (!words.length) return false;
  const hay = `${display_name} ${message || ''}`.toLowerCase();
  return words.some((w) => hay.includes(w));
}

function buildPayload(streamerId, st, { amount, display_name, message, sticker, sticker_only, voice_url, audio_url, test }) {
  const title = buildTitle(st.title_template, display_name, amount, !!st.show_currency);

  // แจ้งเตือนที่กำหนดเองตามจำนวนเงิน (tier) override สวิตช์ TTS/เสียง/GIF ของยอดต่ำกว่าถ้ายอดโดเนทถึงเกณฑ์
  const tier = getActiveTier(streamerId, amount);
  const showGif = tier ? !!tier.gif_enabled : (!!st.gif_enabled && amount >= (st.gif_min_amount || 0));

  return {
    id: 0, amount, display_name, message, voice_url: voice_url || null, audio_url: audio_url || null,
    sticker: sticker ? { code: sticker.code, name: sticker.name, emoji: sticker.emoji, image_url: sticker.image_url, animation: sticker.animation } : null,
    // ส่งสติกเกอร์อย่างเดียว → Overlay แสดง "{ชื่อ} ส่งสติกเกอร์ {ชื่อสติกเกอร์}" แทนหัวข้อโดเนทเงิน
    sticker_only: !!(sticker && sticker_only),
    settings: {
      duration: st.alert_duration_ms, accent: st.accent_color, text: st.text_color, bg: st.bg_color,
      connector: st.connector_color || '#ffffff', title_template: st.title_template || '{name} โดเนท {amount}{currency}',
      show_currency: !!st.show_currency,
      title, sound: tier ? !!tier.sound_enabled : !!st.sound_enabled,
      tts: resolveTts(st, tier ? !!tier.tts_enabled : !!st.tts_enabled, amount),
      tts_lang: st.tts_lang, tts_voice_name: st.tts_voice_name || '',
      tts_read_symbols: !!st.tts_read_symbols, tts_persist_after_hide: !!st.tts_persist_after_hide,
      custom_sound_url: st.custom_sound_url || '', gif_url: showGif ? (st.custom_gif_url || '') : '',
      show: amount >= (st.min_alert_amount || 1) && !isFiltered(st.word_filter, display_name, message),
    },
    test: !!test, created_at: Date.now(),
  };
}

router.post('/', requireVerified, async (req, res) => {
  const streamerName = String(req.body.streamer || '').trim().toLowerCase();
  const display_name = clean(req.body.display_name || req.user.display_name || req.user.username, 40);
  const stickerCode = req.body.sticker_code ? String(req.body.sticker_code) : null;
  const stickerOnly = !!req.body.sticker_only;
  // ส่งสติกเกอร์อย่างเดียวแนบข้อความไม่ได้
  const message = stickerOnly ? '' : clean(req.body.message || '', 200);

  const streamer = db.prepare("SELECT * FROM users WHERE username = ? AND role IN ('streamer','admin')").get(streamerName);
  if (!streamer) return res.status(404).json({ error: 'ไม่พบสตรีมเมอร์นี้' });
  if (streamer.id === req.user.id) return res.status(400).json({ error: 'โดเนทให้ตัวเองไม่ได้' });
  if (streamer.banned) return res.status(403).json({ error: 'สตรีมเมอร์รายนี้ถูกระงับ' });
  if (!plans.isActive(streamer)) return res.status(403).json({ error: 'สตรีมเมอร์รายนี้ปิดรับโดเนทชั่วคราว (แพลนหมดอายุ)' });

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

  // แนบคลิปเสียง/ไฟล์เพลงได้ก็ต่อเมื่อสตรีมเมอร์เปิดใช้ฟีเจอร์นี้และยอดโดเนทถึงขั้นต่ำที่ตั้งไว้
  let voice_url = null, audio_url = null;
  if (st.voice_msg_enabled && amount >= (st.voice_msg_min_amount || 1) && req.body.voice_clip) {
    voice_url = saveMediaClip(req.body.voice_clip, { maxBytes: 2 * 1024 * 1024, allowedExt: ['webm', 'ogg', 'wav', 'mp3', 'mpeg'] });
  }
  if (st.audio_msg_enabled && amount >= (st.audio_msg_min_amount || 1) && req.body.audio_clip) {
    audio_url = saveMediaClip(req.body.audio_clip, { maxBytes: 8 * 1024 * 1024, allowedExt: ['mp3', 'mpeg', 'wav', 'ogg'] });
  }

  let result;
  try {
    result = db.transaction(() => {
      const info = db.prepare(`INSERT INTO donations
        (donor_user_id, streamer_user_id, amount, display_name, message, sticker_code, sticker_cost, streamer_credit, platform_fee, total_cost, voice_url, audio_url, hide_email, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        req.user.id, streamer.id, amount, display_name, message, stickerCode, stickerCost, credit, fee, total, voice_url, audio_url,
        req.body.hide_email ? 1 : 0, now());

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

  const payload = buildPayload(streamer.id, st, { amount, display_name, message, sticker, sticker_only: stickerOnly, voice_url, audio_url });
  payload.id = result.id;
  // เงินโอนเสร็จแล้ว — สร้างไฟล์เสียง AI ก่อนส่งแจ้งเตือน (ล้มเหลว = ไม่มี tts_url, Overlay ใช้เสียงเบราว์เซอร์แทน)
  await tts.attachAiVoice(payload, st);
  req.app.get('io').to('stream:' + streamer.id).emit('donation', payload);
  notify.donationReceived(streamer.id, { display_name, amount, message, sticker, sticker_only: stickerOnly });
  // แดชบอร์ดที่เปิดค้างไว้: สตรีมเมอร์ = มีโดเนทเข้า (อัปเดตทุกธุรกรรม/รายได้/กระดิ่ง), ผู้โดเนท = อัปเดตประวัติการโดเนทของฉัน
  const io = req.app.get('io');
  io.to('user:' + streamer.id).emit('donation:received', { id: result.id });
  io.to('user:' + req.user.id).emit('donation:sent', { id: result.id });

  res.json({ ok: true, donation_id: result.id, balance: result.donorBal });
});

router.get('/sent', (req, res) => {
  res.json(db.prepare(`SELECT d.*, u.username AS streamer_username
    FROM donations d JOIN users u ON u.id = d.streamer_user_id
    WHERE d.donor_user_id = ? ORDER BY d.id DESC LIMIT 50`).all(req.user.id));
});

module.exports = router;
