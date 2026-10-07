const fs = require('fs');
const path = require('path');
const { db } = require('./db');
const { buildTitle, resolveTts } = require('./util');
const { getActiveTier } = require('./tiers');
const tts = require('./tts');
const notify = require('./notify');

// สร้างและส่งแจ้งเตือนโดเนทไปที่ Overlay (OBS) + แดชบอร์ด/กระดิ่งของสตรีมเมอร์
// ใช้ตอนโดเนทสำเร็จ (src/qrDonations.js) — ไฟล์เสียงที่ผู้ชมแนบเก็บไว้ตั้งแต่ตอนสร้างรายการ

const MEDIA_DIR = require('./config').uploadDir('donation-media');

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
  donations_enabled: 1, stickers_enabled: 1, gif_size: 'large',
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
      custom_sound_url: st.custom_sound_url || '', gif_url: showGif ? (st.custom_gif_url || '') : '', gif_size: st.gif_size || 'large',
      show: amount >= (st.min_alert_amount || 1) && !isFiltered(st.word_filter, display_name, message),
    },
    test: !!test, created_at: Date.now(),
  };
}

function streamerSettings(streamerId) {
  return { ...DEFAULT_SETTINGS, ...(db.prepare('SELECT * FROM streamer_settings WHERE user_id = ?').get(streamerId) || {}) };
}

// d = แถวใน donations ที่เพิ่งสร้าง (+ sticker_only)
async function deliver(io, d) {
  const st = streamerSettings(d.streamer_user_id);
  const sticker = getSticker(d.sticker_code);
  const payload = buildPayload(d.streamer_user_id, st, {
    amount: d.amount, display_name: d.display_name, message: d.message, sticker,
    sticker_only: !!d.sticker_only, voice_url: d.voice_url, audio_url: d.audio_url,
  });
  payload.id = d.id;
  // สร้างไฟล์เสียง AI ก่อนส่งแจ้งเตือน (ล้มเหลว = ไม่มี tts_url, Overlay ใช้เสียงเบราว์เซอร์แทน)
  await tts.attachAiVoice(payload, st);
  io.to('stream:' + d.streamer_user_id).emit('donation', payload);
  notify.donationReceived(d.streamer_user_id, { display_name: d.display_name, amount: d.amount, message: d.message, sticker, sticker_only: !!d.sticker_only });
  // แดชบอร์ดที่เปิดค้างไว้: สตรีมเมอร์ = มีโดเนทเข้า, ผู้โดเนท (ถ้าล็อกอิน) = อัปเดตประวัติการโดเนทของฉัน
  io.to('user:' + d.streamer_user_id).emit('donation:received', { id: d.id });
  if (d.donor_user_id) io.to('user:' + d.donor_user_id).emit('donation:sent', { id: d.id });
}

module.exports = { DEFAULT_SETTINGS, streamerSettings, saveMediaClip, getSticker, buildPayload, deliver };
