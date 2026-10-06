require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const { Server } = require('socket.io');

const { IS_PROD, UPLOAD_DIR, DATA_DIR, ALLOW_MOCK_PAYMENTS } = require('./src/config');
// เซิร์ฟเวอร์จริงต้องมี SESSION_SECRET — ไม่งั้นใครก็ปลอม cookie เข้าสู่ระบบเป็นคนอื่นได้
if (IS_PROD && !process.env.SESSION_SECRET) {
  console.error('[error] ต้องตั้งค่า SESSION_SECRET (สตริงสุ่มยาว ๆ) ก่อนรันในโหมด production');
  process.exit(1);
}

const { db } = require('./src/db');
const { passport } = require('./src/google');
const { SqliteSessionStore } = require('./src/sessionStore');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.set('io', io);
require('./src/notify').setIo(io);
app.set('trust proxy', 1);


app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
const sessionMiddleware = session({
  store: new SqliteSessionStore(),
  secret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 3600 * 1000,
    // บนเว็บจริง (https) ส่ง cookie เฉพาะผ่าน https — ปิดได้ด้วย COOKIE_SECURE=false
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : IS_PROD,
  },
});
app.use(sessionMiddleware);
// ให้ socket.io ใช้ session เดียวกับเว็บ (แดชบอร์ดรับอัปเดต realtime โดยไม่ต้องส่ง key อะไรเพิ่ม)
io.engine.use(sessionMiddleware);
app.use(passport.initialize());

// ---------- API ----------
app.use('/auth', require('./src/routes/auth.routes'));
app.use('/api/me', require('./src/routes/user.routes'));
app.use('/api/topup', require('./src/routes/topup.routes'));
app.use('/api/donate', require('./src/routes/donate.routes'));
app.use('/api/streamer', require('./src/routes/streamer.routes'));
app.use('/api/admin', require('./src/routes/admin.routes'));
app.use('/api/public', require('./src/routes/public.routes'));
app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

// ---------- OBS overlay page ----------
// ---------- หน้าโดเนทสาธารณะของสตรีมเมอร์แต่ละคน ----------
app.get('/u/:username', (req, res) => res.sendFile(path.join(__dirname, 'public', 'u.html')));
// หน้าจ่ายเงินจำลองที่เปิดจากการสแกน QR PromptPay (มือถือ)
app.get('/pay/:ref', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pay.html')));

// no-store: ให้ OBS Browser Source โหลดหน้าใหม่ทุกครั้ง ไม่ค้างสไตล์เก่าหลังแก้ overlay.html
app.get('/overlay/:key', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

// ---------- static frontend ----------
// ไฟล์ที่ผู้ใช้อัปโหลด (อยู่บน Volume เมื่อตั้ง DATA_DIR)
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ให้ Railway เช็คว่าเซิร์ฟเวอร์พร้อม
app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---------- realtime ----------
io.on('connection', (socket) => {
  // ล็อกอินอยู่ → เข้าห้องของตัวเอง ไว้รับ "มีโดเนทเข้า" / "แจ้งเตือนใหม่" แบบ realtime ในแดชบอร์ด
  const uid = socket.request.session && socket.request.session.userId;
  if (uid) socket.join('user:' + uid);

  socket.on('overlay:join', (key) => {
    const s = db.prepare('SELECT id FROM users WHERE overlay_key = ?').get(String(key || ''));
    if (!s) return socket.emit('overlay:error', 'invalid key');
    socket.join('stream:' + s.id);
    socket.emit('overlay:ready', { ok: true });
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'server error' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  ◆ Donate Stream  →  ${process.env.BASE_URL || 'http://localhost:' + PORT}`);
  console.log(`  ข้อมูล: ${DATA_DIR}${IS_PROD ? ' (production)' : ''}${ALLOW_MOCK_PAYMENTS ? ' · เติมเงินจำลอง: เปิด' : ''}`);
  require('./src/mailer').checkMailer();
});
