// ลิงก์โซเชียลมีเดียของผู้ใช้ — เก็บเป็น JSON ในคอลัมน์ users.social_links
const SOCIAL_KEYS = [
  'instagram', 'youtube', 'tiktok', 'facebook', 'twitter', 'linkedin',
  'spotify', 'discord', 'twitch', 'telegram', 'website',
];
const LABELS = {
  instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok', facebook: 'Facebook', twitter: 'Twitter',
  linkedin: 'LinkedIn', spotify: 'Spotify', discord: 'Discord', twitch: 'Twitch', telegram: 'Telegram', website: 'Blog/Website',
};

// รับเฉพาะ http/https เท่านั้น (กัน javascript: หรือ data: ที่จะกลายเป็น XSS ตอนแสดงเป็นลิงก์)
// ถ้าพิมพ์มาไม่มี scheme เช่น "instagram.com/me" จะเติม https:// ให้
function normalizeUrl(raw) {
  let v = String(raw || '').trim().slice(0, 300);
  if (!v) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v.replace(/^\/+/, '');
  let u;
  try { u = new URL(v); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname.includes('.')) return null;
  return u.href;
}

// คืน { links } หรือ { error } — ค่าว่างแปลว่าลบลิงก์นั้น
function sanitizeSocialLinks(input) {
  const links = {};
  if (!input || typeof input !== 'object') return { links };
  for (const key of SOCIAL_KEYS) {
    if (input[key] === undefined) continue;
    const url = normalizeUrl(input[key]);
    if (url === null) return { error: `ลิงก์ ${LABELS[key]} ไม่ถูกต้อง (ต้องเป็นลิงก์ http:// หรือ https://)` };
    if (url) links[key] = url;
  }
  return { links };
}

function parseSocialLinks(json) {
  try {
    const obj = JSON.parse(json || '{}');
    const out = {};
    for (const key of SOCIAL_KEYS) if (typeof obj[key] === 'string' && obj[key]) out[key] = obj[key];
    return out;
  } catch { return {}; }
}

module.exports = { SOCIAL_KEYS, sanitizeSocialLinks, parseSocialLinks };
