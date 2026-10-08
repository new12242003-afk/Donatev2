const { db, getConfig, setConfigValue } = require('./db');

// หมวดหมู่ครีเอเตอร์: หมวดหลัก (users.creator_category) + หมวดย่อย (users.creator_subcategories, JSON array)
// ที่เดียวที่กำหนดรายการ — แดชบอร์ดและหน้าสตรีมเมอร์ดึงผ่าน GET /api/public/categories
// เปลี่ยนชื่อหมวดที่มีคนเลือกไว้แล้ว = ต้องย้ายข้อมูลเดิมด้วย (ดู LEGACY_MAP ด้านล่าง) — เพิ่มหมวดใหม่ได้ปลอดภัย
// หมวดหลัก 5 หมวดแบบ Twitch: เกม / ไลฟ์สไตล์ / เพลงและดีเจ / สร้างสรรค์ / อีสปอร์ต
const CREATOR_CATEGORIES = [
  {
    name: 'เกม',
    subs: ['Roblox', 'Minecraft', 'Fortnite', 'GTA V', 'PUBG', 'Free Fire', 'Valorant', 'CS2', 'Dota 2', 'League of Legends',
      'RoV', 'Mobile Legends', 'Genshin Impact', 'Honkai: Star Rail', 'Wuthering Waves', 'Call of Duty', 'Apex Legends',
      'Overwatch 2', 'EA Sports FC', 'Elden Ring', 'อื่นๆ'],
  },
  {
    name: 'ไลฟ์สไตล์',
    subs: ['แชทสบายๆ', 'IRL', 'ASMR', 'กีฬา', 'Chess', 'การทำงานหรือศึกษาด้วยกัน', 'อื่นๆ'],
  },
  { name: 'เพลงและดีเจ', subs: ['ร้องเพลง', 'เล่นดนตรีและแต่งเพลง', 'อื่นๆ'] },
  {
    name: 'สร้างสรรค์',
    subs: ['ศิลปะ', 'งานช่างและงานฝีมือ', 'การพัฒนาซอฟต์แวร์และเกม', 'อาหารและเครื่องดื่ม',
      'LEGO และการต่อตัวต่อ', 'การเขียนและการอ่าน', 'อื่นๆ'],
  },
  {
    name: 'อีสปอร์ต',
    subs: ['Valorant', 'CS2', 'Dota 2', 'League of Legends', 'RoV', 'Mobile Legends', 'PUBG', 'Free Fire',
      'Overwatch 2', 'Apex Legends', 'Call of Duty', 'EA Sports FC', 'อื่นๆ'],
  },
];
const MAX_SUBS = 5;

// ไอคอนบนการ์ดหมวดย่อยในหน้าสตรีมเมอร์ (ไม่มีในรายการ = ใช้ไอคอนของหมวดหลัก)
const SUB_ICONS = {
  เกม: {
    Roblox: '🧱', Minecraft: '⛏️', Fortnite: '🪂', 'GTA V': '🚗', PUBG: '🪖', 'Free Fire': '🔥', Valorant: '🎯', CS2: '💣',
    'Dota 2': '🛡️', 'League of Legends': '⚔️', RoV: '🏰', 'Mobile Legends': '📱', 'Genshin Impact': '🌬️',
    'Honkai: Star Rail': '🚂', 'Wuthering Waves': '🌊', 'Call of Duty': '🎖️', 'Apex Legends': '🦾', 'Overwatch 2': '🦸',
    'EA Sports FC': '⚽', 'Elden Ring': '💍', อื่นๆ: '🎮',
  },
  ไลฟ์สไตล์: {
    แชทสบายๆ: '💬', IRL: '📍', ASMR: '🎙️', กีฬา: '🏅', Chess: '♟️', การทำงานหรือศึกษาด้วยกัน: '📚', อื่นๆ: '✨',
  },
  เพลงและดีเจ: { ร้องเพลง: '🎤', เล่นดนตรีและแต่งเพลง: '🎸', อื่นๆ: '🎵' },
  สร้างสรรค์: {
    ศิลปะ: '🎨', งานช่างและงานฝีมือ: '✂️', การพัฒนาซอฟต์แวร์และเกม: '💻', อาหารและเครื่องดื่ม: '🍳',
    'LEGO และการต่อตัวต่อ': '🧩', การเขียนและการอ่าน: '✍️', อื่นๆ: '💡',
  },
  อีสปอร์ต: {
    Valorant: '🎯', CS2: '💣', 'Dota 2': '🛡️', 'League of Legends': '⚔️', RoV: '🏰', 'Mobile Legends': '📱', PUBG: '🪖',
    'Free Fire': '🔥', 'Overwatch 2': '🦸', 'Apex Legends': '🦾', 'Call of Duty': '🎖️', 'EA Sports FC': '⚽', อื่นๆ: '🏆',
  },
};
// รูปบนการ์ดหมวดย่อย (public/img/categories/) — ไม่มีรูป = ใช้ไอคอนใน SUB_ICONS แทน (เช่น "อื่นๆ")
// อีสปอร์ตใช้รูปชุดเดียวกับเกม
const GAME_IMAGES = {
  Roblox: 'roblox', Minecraft: 'minecraft', Fortnite: 'fortnite', 'GTA V': 'gta-v', PUBG: 'pubg', 'Free Fire': 'free-fire',
  Valorant: 'valorant', CS2: 'cs2', 'Dota 2': 'dota-2', 'League of Legends': 'league-of-legends', RoV: 'rov',
  'Mobile Legends': 'mobile-legends', 'Genshin Impact': 'genshin-impact', 'Honkai: Star Rail': 'honkai-star-rail',
  'Wuthering Waves': 'wuthering-waves', 'Call of Duty': 'call-of-duty', 'Apex Legends': 'apex-legends',
  'Overwatch 2': 'overwatch-2', 'EA Sports FC': 'ea-sports-fc', 'Elden Ring': 'elden-ring',
};
const SUB_IMAGES = {
  เกม: ['game', GAME_IMAGES],
  อีสปอร์ต: ['game', GAME_IMAGES],
  ไลฟ์สไตล์: ['lifestyle', {
    แชทสบายๆ: 'just-chatting', IRL: 'irl', ASMR: 'asmr', กีฬา: 'sports', Chess: 'chess', การทำงานหรือศึกษาด้วยกัน: 'co-working',
  }],
  เพลงและดีเจ: ['music', { ร้องเพลง: 'singing', เล่นดนตรีและแต่งเพลง: 'music-songwriting' }],
  สร้างสรรค์: ['creative', {
    ศิลปะ: 'art', งานช่างและงานฝีมือ: 'crafts', การพัฒนาซอฟต์แวร์และเกม: 'software-game-dev', อาหารและเครื่องดื่ม: 'food-drink',
    'LEGO และการต่อตัวต่อ': 'lego', การเขียนและการอ่าน: 'writing-reading',
  }],
};
CREATOR_CATEGORIES.forEach((c) => {
  c.icons = SUB_ICONS[c.name] || {};
  const [dir, files] = SUB_IMAGES[c.name] || ['', {}];
  c.images = {};
  c.subs.forEach((s) => { if (files[s]) c.images[s] = `/img/categories/${dir}/${files[s]}.jpg`; });
});

// หมวดย่อยที่ถูกรวม/เปลี่ยนชื่อ: ชื่อเดิม → ชื่อใหม่ — คนที่เลือกชื่อเดิมไว้ย้ายไปชื่อใหม่ ไม่หายไปเฉย ๆ
const SUB_RENAMES = {
  เพลงและดีเจ: { เล่นดนตรี: 'เล่นดนตรีและแต่งเพลง', แต่งเพลง: 'เล่นดนตรีและแต่งเพลง' },
};

function renameSubs(catName, subs) {
  const map = SUB_RENAMES[catName] || {};
  return [...new Set(subs.map((s) => map[s] || s))];
}

function findCategory(name) {
  return CREATOR_CATEGORIES.find((c) => c.name === name) || null;
}

// ตรวจค่าที่ผู้ใช้ส่งมา → { category, subs } หรือ { error }
// หมวดย่อยต้องอยู่ในหมวดหลักที่เลือก, ไม่ซ้ำ, ไม่เกิน MAX_SUBS (เรียงตามลำดับในรายการ)
// current = หมวดเดิมของผู้ใช้: ถ้าเป็นหมวดเก่าที่ไม่มีในรายการแล้ว ยังบันทึกซ้ำได้ (กดบันทึก bio แล้วไม่ error)
function cleanCategories(category, subs, current) {
  const name = String(category || '').trim();
  if (!name) return { category: '', subs: [] };
  const cat = findCategory(name);
  if (!cat && current && name === current) return { category: name, subs: [] };
  if (!cat) return { error: 'หมวดหมู่ครีเอเตอร์ไม่ถูกต้อง' };
  const picked = Array.isArray(subs) ? subs.map((s) => String(s)) : [];
  if (picked.some((s) => !cat.subs.includes(s))) return { error: `หมวดย่อยไม่อยู่ในหมวด ${cat.name}` };
  const unique = cat.subs.filter((s) => picked.includes(s));
  if (unique.length > MAX_SUBS) return { error: `เลือกหมวดย่อยได้สูงสุด ${MAX_SUBS} อย่าง` };
  return { category: cat.name, subs: unique };
}

function parseSubs(json) {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
  } catch { return []; }
}

// ---- ย้ายหมวดชุดเก่า (10 หมวด) → ชุดใหม่แบบ Twitch (ทำครั้งเดียว) ----
// หมวดเก่า → [หมวดใหม่, หมวดย่อยที่ใส่ให้] — เกม/ดนตรี มีหมวดย่อยชื่อเดิมอยู่ในหมวดใหม่ จึงเก็บของเดิมไว้ได้
const LEGACY_MAP = {
  'เกม': ['เกม', null],
  'ดนตรี': ['เพลงและดีเจ', null],
  'ศิลปะ': ['สร้างสรรค์', ['ศิลปะ']],
  'อาหาร': ['สร้างสรรค์', ['อาหารและเครื่องดื่ม']],
  'ท่องเที่ยว': ['ไลฟ์สไตล์', ['IRL']],
  'การศึกษา': ['ไลฟ์สไตล์', ['การทำงานหรือศึกษาด้วยกัน']],
  'ไลฟ์สไตล์': ['ไลฟ์สไตล์', []],
  'กีฬา': ['ไลฟ์สไตล์', ['กีฬา']],
  'ธุรกิจ': ['ไลฟ์สไตล์', ['อื่นๆ']],
  'อื่นๆ': ['ไลฟ์สไตล์', ['อื่นๆ']],
};

function migrateLegacy(oldCat, oldSubs) {
  const m = LEGACY_MAP[oldCat];
  if (!m) return null;
  // กีฬา › E-Sports เดิม → หมวดอีสปอร์ต
  if (oldCat === 'กีฬา' && oldSubs.includes('E-Sports')) return { category: 'อีสปอร์ต', subs: [] };
  const [name, subs] = m;
  const cat = findCategory(name);
  // null = เก็บหมวดย่อยเดิมที่ยังมีในหมวดใหม่ (ชื่อเดียวกัน หรือชื่อที่ถูกรวมแล้วตาม SUB_RENAMES)
  const renamed = renameSubs(name, oldSubs);
  const keep = subs === null ? cat.subs.filter((s) => renamed.includes(s)) : subs;
  return { category: name, subs: keep.slice(0, MAX_SUBS) };
}

if (getConfig('categories_twitch_migrated', '') !== '1') {
  const rows = db.prepare("SELECT id, creator_category, creator_subcategories FROM users WHERE creator_category IS NOT NULL AND creator_category != ''").all();
  const upd = db.prepare('UPDATE users SET creator_category = ?, creator_subcategories = ? WHERE id = ?');
  rows.forEach((r) => {
    const next = migrateLegacy(r.creator_category, parseSubs(r.creator_subcategories));
    if (next) upd.run(next.category, JSON.stringify(next.subs), r.id);
  });
  setConfigValue('categories_twitch_migrated', '1');
}

// ล้างหมวดย่อยที่ถูกเอาออกจากรายการแล้ว (เช่น Slots) และย้ายชื่อที่ถูกรวม (SUB_RENAMES) ในข้อมูลผู้ใช้
// ทำทุกครั้งที่เปิดเซิร์ฟเวอร์ ไม่แตะแถวที่ถูกต้องอยู่แล้ว
// ไม่ล้าง = แดชบอร์ดส่งหมวดย่อยเก่ากลับมาแล้วบันทึกอัตโนมัติ error "หมวดย่อยไม่อยู่ในหมวด"
{
  const rows = db.prepare("SELECT id, creator_category, creator_subcategories FROM users WHERE creator_subcategories IS NOT NULL AND creator_subcategories NOT IN ('', '[]')").all();
  const upd = db.prepare('UPDATE users SET creator_subcategories = ? WHERE id = ?');
  rows.forEach((r) => {
    const cat = findCategory(r.creator_category);
    if (!cat) return;   // หมวดเก่าที่ไม่มีในรายการ — ปล่อยไว้ตามเดิม
    const renamed = renameSubs(cat.name, parseSubs(r.creator_subcategories));
    const keep = JSON.stringify(cat.subs.filter((s) => renamed.includes(s)));
    if (keep !== r.creator_subcategories) upd.run(keep, r.id);
  });
}

module.exports = { CREATOR_CATEGORIES, MAX_SUBS, cleanCategories, parseSubs, migrateLegacy };
