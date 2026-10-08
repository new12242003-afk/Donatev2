const { db } = require('./db');
const { now, clean } = require('./util');

// สถานะไลฟ์ของสตรีมเมอร์ + ตารางไลฟ์รายสัปดาห์ (แสดงในหน้าโดเนทและหน้าสตรีมเมอร์)
// live_mode:
//   auto    = ออนไลน์เมื่อ Overlay ที่เปิดอยู่ใน OBS รายงานว่ากำลังสตรีม (window.obsstudio ใน overlay.html)
//             ถ้า OBS ไม่ยอมบอกสถานะ (Browser Source สิทธิ์ต่ำ / OBS เวอร์ชันเก่า) ถือว่าเปิด OBS อยู่ = ออนไลน์
//   online  = แสดงว่ากำลังไลฟ์ตลอด (ใช้โปรแกรมอื่นที่ไม่ใช่ OBS)
//   offline = แสดงว่าออฟไลน์ตลอด
// สถานะจาก OBS เก็บในหน่วยความจำ — เซิร์ฟเวอร์รีสตาร์ทแล้ว Overlay เชื่อมต่อใหม่และรายงานกลับมาเอง
const MODES = ['auto', 'online', 'offline'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// userId -> Map(socketId -> { streaming: true | false | null(ไม่รู้) })
const overlays = new Map();
const lastLive = new Map();
let io = null;
function setIo(x) { io = x; }

function settingsOf(uid) {
  return db.prepare('SELECT live_mode, stream_schedule, schedule_note, last_live_at FROM streamer_settings WHERE user_id = ?').get(uid) || {};
}

function modeOf(s) { return MODES.includes(s.live_mode) ? s.live_mode : 'auto'; }

function obsInfo(uid) {
  const m = overlays.get(uid);
  const list = m ? [...m.values()] : [];
  return {
    obs_connected: list.length > 0,
    obs_streaming: list.some((o) => o.streaming === true),
    obs_unknown: list.length > 0 && list.every((o) => o.streaming === null),
  };
}

function isLive(uid, s = settingsOf(uid)) {
  const mode = modeOf(s);
  if (mode !== 'auto') return mode === 'online';
  const o = obsInfo(uid);
  return o.obs_streaming || o.obs_unknown;
}

// ตารางไลฟ์: วันละ 1 ช่วง, day 0 = อาทิตย์ … 6 = เสาร์, เวลา HH:MM (เวลาไทย) — end น้อยกว่า start = ข้ามเที่ยงคืน
function cleanSchedule(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const x of list.slice(0, 7)) {
    const day = Number(x && x.day);
    if (!Number.isInteger(day) || day < 0 || day > 6 || out.some((o) => o.day === day)) continue;
    if (!TIME_RE.test(x.start) || !TIME_RE.test(x.end) || x.start === x.end) continue;
    out.push({ day, start: x.start, end: x.end });
  }
  return out.sort((a, b) => a.day - b.day);
}

function parseSchedule(json) {
  try { return cleanSchedule(JSON.parse(json || '[]')); } catch { return []; }
}

// ข้อมูลที่ผู้ชมเห็น (ไม่บอกว่าออนไลน์เพราะตั้งเองหรือจาก OBS)
function publicView(uid, s = settingsOf(uid)) {
  const live = isLive(uid, s);
  return {
    live,
    last_live_at: live ? null : s.last_live_at || null,
    schedule: parseSchedule(s.stream_schedule),
    schedule_note: s.schedule_note || '',
  };
}

// ข้อมูลสำหรับแดชบอร์ดของสตรีมเมอร์เอง
function ownerView(uid) {
  const s = settingsOf(uid);
  return { ...publicView(uid, s), live_mode: modeOf(s), ...obsInfo(uid) };
}

// คำนวณสถานะใหม่ทุกครั้งที่ OBS / การตั้งค่าเปลี่ยน — จดเวลาออนไลน์ล่าสุด แล้วส่งสถานะไปแดชบอร์ดของเจ้าของ
// แล้วกระจายให้หน้าสาธารณะที่เปิดอยู่ (หน้าสตรีมเมอร์ / หน้าโดเนท เข้าห้อง live-watch) อัปเดตทันที
function refresh(uid) {
  const live = isLive(uid);
  if (live || lastLive.get(uid)) db.prepare('UPDATE streamer_settings SET last_live_at = ? WHERE user_id = ?').run(now(), uid);
  lastLive.set(uid, live);
  if (!io) return;
  io.to('user:' + uid).emit('live:status', ownerView(uid));
  const u = db.prepare('SELECT username FROM users WHERE id = ?').get(uid);
  if (u) io.to('live-watch').emit('live:update', { username: u.username, live: publicView(uid) });
}

// หน้าสาธารณะขอรับสถานะไลฟ์ + โปรไฟล์แบบ realtime (ข้อมูลเดียวกับที่ API สาธารณะให้อยู่แล้ว ไม่มีอะไรลับ)
function watchPublic(socket) {
  socket.on('live:watch', () => socket.join('live-watch'));
}

// สตรีมเมอร์แก้โปรไฟล์สาธารณะ (ชื่อ / รูป / ปก / bio / หมวด / โซเชียล) → หน้าสตรีมเมอร์และหน้าโดเนทที่เปิดอยู่อัปเดตทันที
// ส่งเฉพาะฟิลด์ที่ /api/public/streamers แสดงอยู่แล้ว — ผู้โดเนท / บัญชีที่ถูกระงับไม่ส่ง
function broadcastProfile(uid) {
  if (!io) return;
  const u = db.prepare(`SELECT username, display_name, avatar_url, cover_url, bio, creator_category, creator_subcategories, social_links
    FROM users WHERE id = ? AND role IN ('streamer','admin') AND banned = 0`).get(uid);
  if (!u) return;
  const { parseSocialLinks } = require('./social');
  const { parseSubs } = require('./categories');
  io.to('live-watch').emit('profile:update', {
    username: u.username,
    profile: {
      display_name: u.display_name || u.username, avatar_url: u.avatar_url || null, cover_url: u.cover_url || null,
      bio: u.bio || '', creator_category: u.creator_category || '',
      creator_subcategories: parseSubs(u.creator_subcategories), social_links: parseSocialLinks(u.social_links),
    },
  });
}

// เรียกหลัง overlay:join สำเร็จ — Overlay ใน OBS ส่ง overlay:live { streaming } มา (เปิดในเบราว์เซอร์ทั่วไปจะไม่ส่ง = ไม่นับ)
function watchOverlay(socket, uid) {
  socket.on('overlay:live', (info) => {
    const streaming = info && typeof info.streaming === 'boolean' ? info.streaming : null;
    if (!overlays.has(uid)) overlays.set(uid, new Map());
    overlays.get(uid).set(socket.id, { streaming });
    refresh(uid);
  });
  socket.on('disconnect', () => {
    const m = overlays.get(uid);
    if (!m || !m.delete(socket.id)) return;
    if (!m.size) overlays.delete(uid);
    refresh(uid);
  });
}

function saveSettings(uid, body) {
  const s = settingsOf(uid);
  const mode = MODES.includes(body.live_mode) ? body.live_mode : modeOf(s);
  const schedule = body.schedule !== undefined ? cleanSchedule(body.schedule) : parseSchedule(s.stream_schedule);
  const note = body.schedule_note !== undefined ? clean(body.schedule_note || '', 120) : s.schedule_note || '';
  db.prepare('UPDATE streamer_settings SET live_mode = ?, stream_schedule = ?, schedule_note = ?, updated_at = ? WHERE user_id = ?')
    .run(mode, JSON.stringify(schedule), note, now(), uid);
  refresh(uid);
  return ownerView(uid);
}

module.exports = { setIo, isLive, publicView, ownerView, watchOverlay, watchPublic, broadcastProfile, saveSettings };
