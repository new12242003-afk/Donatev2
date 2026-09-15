require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const { Server } = require('socket.io');

const { db } = require('./src/db');
const { passport } = require('./src/google');
const { SqliteSessionStore } = require('./src/sessionStore');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.set('io', io);
app.set('trust proxy', 1);

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.warn('[warn] ยังไม่ได้ตั้งค่า SESSION_SECRET ใน .env — ควรตั้งเป็นสตริงสุ่มยาวๆ ก่อนใช้งานจริง');
}

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SqliteSessionStore(),
  secret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 3600 * 1000,
    secure: process.env.COOKIE_SECURE === 'true',
  },
}));
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
app.get('/overlay/:key', (req, res) => res.sendFile(path.join(__dirname, 'public', 'overlay.html')));

// ---------- static frontend ----------
app.use(express.static(path.join(__dirname, 'public')));

// ---------- realtime ----------
io.on('connection', (socket) => {
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
  console.log(`\n  ◆ Donate Stream  →  http://localhost:${PORT}`);
  console.log(`  แอดมิน: admin / admin123\n`);
});
