const fs = require('fs');
const path = require('path');

// AI เสียงพูดข้อความโดเนท ผ่าน Google Cloud Text-to-Speech
// ตั้ง GOOGLE_TTS_API_KEY ใน .env — ไม่ได้ตั้ง/เรียกไม่สำเร็จ = คืน null แล้ว Overlay ใช้เสียงของเบราว์เซอร์แทน
const TTS_DIR = require('./config').uploadDir('tts');

// เสียงภาษาไทยที่ให้สตรีมเมอร์เลือก (ชื่อตรงตาม Google Cloud TTS)
const AI_VOICES = [
  { name: 'th-TH-Chirp3-HD-Kore', label: 'Kore — หญิง (HD เป็นธรรมชาติที่สุด)' },
  { name: 'th-TH-Chirp3-HD-Aoede', label: 'Aoede — หญิง (HD)' },
  { name: 'th-TH-Chirp3-HD-Charon', label: 'Charon — ชาย (HD)' },
  { name: 'th-TH-Chirp3-HD-Puck', label: 'Puck — ชาย (HD)' },
  { name: 'th-TH-Neural2-C', label: 'Neural2-C — หญิง' },
  { name: 'th-TH-Standard-A', label: 'Standard-A — หญิง (ประหยัด)' },
];
const DEFAULT_VOICE = AI_VOICES[0].name;
const KEEP_MS = 24 * 60 * 60 * 1000;

function isConfigured() { return !!process.env.GOOGLE_TTS_API_KEY; }

function voiceOrDefault(name) {
  return AI_VOICES.some((v) => v.name === name) ? name : DEFAULT_VOICE;
}

// ประโยคที่อ่านออกเสียง เช่น "test โดเนท 20 aaaaaaa"
// ต้องตรงกับ speechText() ใน public/overlay.html (ใช้ตอนอ่านด้วยเสียงเบราว์เซอร์)
function speechText(d, readSymbols) {
  // ลำดับตายตัวทุกกรณี (รวมส่งสติกเกอร์): ชื่อผู้ส่ง → "โดเนท" → จำนวนเงิน → ข้อความ (ไม่อิงรูปแบบหัวข้อบนจอ)
  const head = `${d.display_name || 'ไม่ระบุชื่อ'} โดเนท ${Number(d.amount).toLocaleString('th-TH')}`;
  let msg = String(d.message || '');
  if (!readSymbols) msg = msg.replace(/[@~#*_^`|\\]/g, '');
  // ส่งสติกเกอร์อย่างเดียวไม่มีข้อความ — อ่านชื่อสติกเกอร์แทน
  if (d.sticker_only && d.sticker && !msg) msg = 'สติกเกอร์ ' + (d.sticker.name || '');
  return `${head} ${msg}`.replace(/\s+/g, ' ').trim().slice(0, 400);
}

// ไฟล์เสียงใช้ครั้งเดียวตอนแจ้งเตือน — เก็บไว้ 1 วันแล้วลบทิ้ง กันไฟล์สะสมเต็มดิสก์
function sweepOld() {
  fs.readdir(TTS_DIR, (err, files) => {
    if (err) return;
    const cutoff = Date.now() - KEEP_MS;
    files.forEach((f) => {
      const p = path.join(TTS_DIR, f);
      fs.stat(p, (e, st) => { if (!e && st.mtimeMs < cutoff) fs.unlink(p, () => {}); });
    });
  });
}

async function synthesize(text, voiceName) {
  if (!isConfigured() || !text) return null;
  const voice = voiceOrDefault(voiceName);
  try {
    const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + encodeURIComponent(process.env.GOOGLE_TTS_API_KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'th-TH', name: voice },
        audioConfig: { audioEncoding: 'MP3' },
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.audioContent) {
      console.warn('[TTS] Google TTS error:', res.status, data && data.error ? data.error.message : '');
      return null;
    }
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    fs.writeFileSync(path.join(TTS_DIR, filename), Buffer.from(data.audioContent, 'base64'));
    sweepOld();
    return '/uploads/tts/' + filename;
  } catch (e) {
    console.warn('[TTS] Google TTS failed:', e.message);
    return null;
  }
}

// ใส่ settings.tts_url ให้ payload แจ้งเตือน ถ้าสตรีมเมอร์เลือกเสียง AI และแจ้งเตือนนี้ต้องอ่านข้อความ
async function attachAiVoice(payload, st) {
  const s = payload.settings;
  if (st.tts_engine !== 'ai' || !s.tts || s.show === false) return payload;
  s.tts_url = await synthesize(speechText(payload, !!st.tts_read_symbols), st.tts_ai_voice);
  return payload;
}

module.exports = { AI_VOICES, DEFAULT_VOICE, isConfigured, synthesize, attachAiVoice, voiceOrDefault };
