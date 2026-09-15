const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const raw = new DatabaseSync(path.join(__dirname, '..', 'data.db'));
raw.exec('PRAGMA journal_mode = WAL');
raw.exec('PRAGMA foreign_keys = ON');

// ---- ห่อ API ให้ใกล้เคียง better-sqlite3 (run คืน Number, มี transaction helper) ----
const db = {
  exec: (sql) => raw.exec(sql),
  prepare: (sql) => {
    const stmt = raw.prepare(sql);
    return {
      run: (...args) => {
        const r = stmt.run(...args);
        return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
      },
      get: (...args) => stmt.get(...args),
      all: (...args) => stmt.all(...args),
    };
  },
  // ใช้แบบ db.transaction(fn)()  เหมือน better-sqlite3
  transaction: (fn) => (...args) => {
    raw.exec('BEGIN');
    try {
      const out = fn(...args);
      raw.exec('COMMIT');
      return out;
    } catch (e) {
      try { raw.exec('ROLLBACK'); } catch (_) {}
      throw e;
    }
  },
};

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'donor',
  display_name TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  verify_token TEXT,
  verify_expires INTEGER,
  google_id TEXT UNIQUE,
  token_balance INTEGER NOT NULL DEFAULT 0,
  earnings_balance INTEGER NOT NULL DEFAULT 0,
  overlay_key TEXT UNIQUE,
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS streamer_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  alert_duration_ms INTEGER NOT NULL DEFAULT 8000,
  min_alert_amount INTEGER NOT NULL DEFAULT 1,
  sound_enabled INTEGER NOT NULL DEFAULT 1,
  tts_enabled INTEGER NOT NULL DEFAULT 0,
  tts_lang TEXT NOT NULL DEFAULT 'th-TH',
  accent_color TEXT NOT NULL DEFAULT '#ffffff',
  text_color TEXT NOT NULL DEFAULT '#ffffff',
  bg_color TEXT NOT NULL DEFAULT 'rgba(10,10,11,0.92)',
  title_template TEXT NOT NULL DEFAULT '{name} โดเนท {amount}฿',
  min_donation INTEGER NOT NULL DEFAULT 1,
  max_donation INTEGER NOT NULL DEFAULT 1000,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS stickers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT,
  image_url TEXT,
  cost INTEGER NOT NULL DEFAULT 10,
  animation TEXT NOT NULL DEFAULT 'float',
  enabled INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS topups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount_baht INTEGER NOT NULL,
  tokens INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'mock',
  status TEXT NOT NULL DEFAULT 'pending',
  reference TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);

CREATE TABLE IF NOT EXISTS donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donor_user_id INTEGER REFERENCES users(id),
  streamer_user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  message TEXT,
  sticker_code TEXT,
  sticker_cost INTEGER NOT NULL DEFAULT 0,
  streamer_credit INTEGER NOT NULL DEFAULT 0,
  platform_fee INTEGER NOT NULL DEFAULT 0,
  total_cost INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER,
  ref_type TEXT,
  ref_id INTEGER,
  note TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'bank',
  account_detail TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  created_at INTEGER NOT NULL,
  processed_at INTEGER
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  streamer_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_don_streamer ON donations(streamer_user_id, id);
CREATE INDEX IF NOT EXISTS idx_don_donor ON donations(donor_user_id, id);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, id);
CREATE INDEX IF NOT EXISTS idx_pv_streamer ON page_views(streamer_user_id, created_at);
`);

// ---- migrations: เพิ่มคอลัมน์โปรไฟล์ผู้ใช้ที่อาจยังไม่มีในฐานข้อมูลเดิม ----
function ensureColumn(table, col, decl) {
  const cols = raw.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
}
[
  ['avatar_url', 'TEXT'],
  ['first_name', 'TEXT'],
  ['last_name', 'TEXT'],
  ['national_id', 'TEXT'],
  ['birth_date', 'TEXT'],
  ['address_line', 'TEXT'],
  ['address_subdistrict', 'TEXT'],
  ['address_district', 'TEXT'],
  ['address_province', 'TEXT'],
  ['address_zipcode', 'TEXT'],
].forEach(([col, decl]) => ensureColumn('users', col, decl));

// อัปเดตสีธีมเริ่มต้นของสตรีมเมอร์ที่ยังไม่เคยปรับแต่งเอง ให้เป็นโทนขาวดำพรีเมี่ยมใหม่
db.prepare(`UPDATE streamer_settings SET accent_color = '#ffffff' WHERE accent_color = '#7c3aed'`).run();
db.prepare(`UPDATE streamer_settings SET bg_color = 'rgba(10,10,11,0.92)' WHERE bg_color = 'rgba(15,15,25,0.92)'`).run();

function getConfig(key, def) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : def;
}
function setConfigValue(key, value) {
  db.prepare(`INSERT INTO config (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value));
}

// ---------- seed ----------
const nowTs = Date.now();

[
  ['site_name', 'Donate Stream'],
  ['platform_fee_percent', '0'],
  ['default_min_donation', '1'],
  ['default_max_donation', '1000'],
  ['topup_packages', '[20,50,100,300,500,1000]'],
].forEach(([k, v]) => {
  db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)').run(k, v);
});

if (!db.prepare('SELECT 1 FROM users WHERE username = ?').get('admin')) {
  db.prepare(`INSERT INTO users (username, email, password_hash, role, display_name, email_verified, created_at)
              VALUES (?, ?, ?, 'admin', 'Administrator', 1, ?)`)
    .run('admin', process.env.ADMIN_EMAIL || 'admin@donate.local', bcrypt.hashSync('admin123', 10), nowTs);
  console.log('[seed] สร้างบัญชีแอดมิน: admin / admin123');
}

if (!db.prepare('SELECT 1 FROM stickers LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO stickers (code, name, emoji, cost, animation, sort) VALUES (?, ?, ?, ?, ?, ?)');
  [
    ['flower', 'ดอกไม้', '🌸', 10, 'float', 1],
    ['rose', 'กุหลาบ', '🌹', 15, 'float', 2],
    ['heart', 'หัวใจ', '❤️', 10, 'rain', 3],
    ['fire', 'ไฟลุก', '🔥', 20, 'bounce', 4],
    ['star', 'ดาว', '⭐', 15, 'zoom', 5],
    ['rocket', 'จรวด', '🚀', 50, 'fly', 6],
    ['party', 'ปาร์ตี้', '🎉', 25, 'rain', 7],
    ['crown', 'มงกุฎ', '👑', 80, 'zoom', 8],
    ['thumbsup', 'ยกนิ้ว', '👍', 5, 'bounce', 9],
    ['diamond', 'เพชร', '💎', 100, 'spin', 10],
    ['rainbow', 'สายรุ้ง', '🌈', 30, 'float', 11],
    ['lightning', 'สายฟ้า', '⚡', 20, 'shake', 12],
    ['money', 'เงินปลิว', '💰', 40, 'rain', 13],
    ['cake', 'เค้ก', '🎂', 25, 'float', 14],
    ['gift', 'ของขวัญ', '🎁', 35, 'bounce', 15],
  ].forEach((r) => ins.run(...r));
  console.log('[seed] เพิ่มสติกเกอร์เริ่มต้น 15 แบบ');
}

module.exports = { db, getConfig, setConfigValue };
