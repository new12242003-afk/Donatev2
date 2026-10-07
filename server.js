require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const { Server } = require('socket.io');

const { IS_PROD, UPLOAD_DIR, DATA_DIR, DATA_EPHEMERAL, PROMPTPAY_ID } = require('./src/config');
const slipVerify = require('./src/slipVerify');
if (DATA_EPHEMERAL) {
  console.warn('\n  ⚠️  [data] ยังไม่ได้ต่อ Volume บน Railway — ฐานข้อมูลและไฟล์อัปโหลดจะหายทุกครั้งที่ deploy');
  console.warn('  ⚠️  [data] แก้: คลิกขวาที่ service → Attach Volume (Mount path เช่น /data) แล้ว deploy ใหม่\n');
}
// เซิร์ฟเวอร์จริงต้องมี SESSION_SECRET — ไม่งั้นใครก็ปลอม cookie เข้าสู่ระบบเป็นคนอื่นได้
if (IS_PROD && !process.env.SESSION_SECRET) {
  console.error('[error] ต้องตั้งค่า SESSION_SECRET (สตริงสุ่มยาว ๆ) ก่อนรันในโหมด production');
  process.exit(1);
}
// โหมดเงินจริง (PromptPay): ตั้งค่าผิด = เงินเข้าผิดบัญชี — หยุดเลยดีกว่ารันต่อ
if (PROMPTPAY_ID && !require('./src/promptpay').parseTarget(PROMPTPAY_ID)) {
  console.error('[error] PROMPTPAY_ID ไม่ถูกต้อง — ต้องเป็นเบอร์มือถือ 10 หลัก, เลขบัตรประชาชน 13 หลัก หรือ e-Wallet ID 15 หลัก');
  process.exit(1);
}
if (!slipVerify.enabled()) console.warn('  [slip] ยังไม่ได้ตั้ง SLIP2GO_API_KEY หรือ EASYSLIP_API_KEY — สลิปเติมเงินรอแอดมินตรวจ / สลิปโดเนทรอสตรีมเมอร์ยืนยันเอง');

const { db } = require('./src/db');
// บัญชีรับค่าแพลน = PROMPTPAY_ID หรือ QR รับเงินของบัญชีแอดมิน
const planReceiver = require('./src/planOrders').receiver();
if (!planReceiver) console.warn('  [plan] ยังไม่มีบัญชีรับค่าแพลน — ล็อกอินแอดมิน → แดชบอร์ด → หน้าโดเนท & QR รับเงิน แล้วตั้ง QR (หรือตั้ง PROMPTPAY_ID) ไม่งั้นสตรีมเมอร์ซื้อแพลนไม่ได้');
else if (slipVerify.enabled() && !planReceiver.bankAccount) console.warn('  [plan] แนะนำใส่เลขบัญชีธนาคารของ QR รับค่าแพลน — สลิปที่แสดงแค่เลขบัญชีผู้รับจะต้องเทียบด้วยชื่อบัญชีแทน');
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
app.use('/api/plan-pay', require('./src/routes/planpay.routes'));
app.use('/api/donate', require('./src/routes/donate.routes'));
app.use('/api/qr-donate', require('./src/routes/qrdonate.routes'));
app.use('/api/streamer', require('./src/routes/streamer.routes'));
app.use('/api/admin', require('./src/routes/admin.routes'));
app.use('/api/support', require('./src/routes/support.routes'));
app.use('/api/public', require('./src/routes/public.routes'));
app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

// ---------- OBS overlay page ----------
// ---------- หน้าโดเนทสาธารณะของสตรีมเมอร์แต่ละคน ----------
app.get('/u/:username', (req, res) => res.sendFile(path.join(__dirname, 'public', 'u.html')));

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
app.get('/healthz', (req, res) => res.json({ ok: true, persistent: !DATA_EPHEMERAL, volume: !!process.env.RAILWAY_VOLUME_MOUNT_PATH }));

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
  console.log(`  ข้อมูล: ${DATA_DIR}${IS_PROD ? ' (production)' : ''}${planReceiver ? ' · ค่าแพลน: PromptPay ' + require('./src/promptpay').masked(planReceiver.target) + (PROMPTPAY_ID ? '' : ' (QR แอดมิน)') : ''}${slipVerify.enabled() ? ' · ตรวจสลิป: ' + slipVerify.provider() : ''}`);
  require('./src/mailer').checkMailer();
});
