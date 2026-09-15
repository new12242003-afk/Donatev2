const session = require('express-session');
const { db } = require('./db');

db.exec(`CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expires INTEGER NOT NULL
)`);

const DEFAULT_TTL_MS = 7 * 24 * 3600 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

// เก็บ session ลงตาราง sessions ในไฟล์ data.db เดิม (แทน MemoryStore ของ express-session ที่ข้อมูลหายทุกครั้ง
// ที่ process รีสตาร์ท) โดยไม่พึ่ง native module เพิ่ม เพื่อคงหลักการ "pure JavaScript" ของโปรเจกต์นี้
class SqliteSessionStore extends session.Store {
  constructor() {
    super();
    this.cleanupTimer = setInterval(() => {
      db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  get(sid, cb) {
    try {
      const row = db.prepare('SELECT sess, expires FROM sessions WHERE sid = ?').get(sid);
      if (!row || row.expires < Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.sess));
    } catch (e) { cb(e); }
  }

  set(sid, sess, cb) {
    try {
      const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + DEFAULT_TTL_MS;
      db.prepare(`INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)
                  ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires`)
        .run(sid, JSON.stringify(sess), expires);
      cb && cb(null);
    } catch (e) { cb && cb(e); }
  }

  destroy(sid, cb) {
    try {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb && cb(null);
    } catch (e) { cb && cb(e); }
  }

  touch(sid, sess, cb) {
    this.set(sid, sess, cb);
  }
}

module.exports = { SqliteSessionStore };
