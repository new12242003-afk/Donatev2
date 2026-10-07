const express = require('express');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const { currentUser, requireAuth, requireRole } = require('../auth');
const { token, now, clean } = require('../util');
const promptpay = require('../promptpay');
const slips = require('../slips');
const slipVerify = require('../slipVerify');
const plans = require('../plans');
const notify = require('../notify');
const alert = require('../donationAlert');
const qr = require('../qrDonations');

// โดเนทผ่าน QR พร้อมเพย์ของสตรีมเมอร์: สร้างรายการ → ผู้ชมสแกนจ่ายตรงเข้าบัญชีสตรีมเมอร์ → อัปโหลดสลิป
// → ตรวจกับธนาคาร (EasySlip) ผ่าน = บันทึกโดเนท + เด้งแจ้งเตือนบน OBS ทันที / ไม่แน่ใจ = สตรีมเมอร์ตรวจเองในแดชบอร์ด
// ผู้ชมไม่ต้องล็อกอิน — รายการผูกกับรหัสลับ (pay_token) ที่ส่งกลับไปให้เบราว์เซอร์ที่สร้างรายการเท่านั้น
const router = express.Router();

const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'สร้างรายการบ่อยเกินไป กรุณารอสักครู่' },
});
const slipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'อัปโหลดสลิปบ่อยเกินไป กรุณารอสักครู่' },
});

router.post('/', createLimiter, (req, res) => {
  const user = currentUser(req);
  if (user && user.banned) return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน' });
  const streamer = db.prepare("SELECT * FROM users WHERE username = ? AND role IN ('streamer','admin')")
    .get(String(req.body.streamer || '').trim().toLowerCase());
  if (!streamer || streamer.banned) return res.status(404).json({ error: 'ไม่พบสตรีมเมอร์นี้' });
  if (user && user.id === streamer.id) return res.status(400).json({ error: 'โดเนทให้ตัวเองไม่ได้' });
  if (!plans.isActive(streamer)) return res.status(403).json({ error: 'สตรีมเมอร์รายนี้ปิดรับโดเนทชั่วคราว (แพลนหมดอายุ)' });
  const target = qr.streamerTarget(streamer);
  if (!target) return res.status(403).json({ error: 'สตรีมเมอร์รายนี้ยังไม่ได้ตั้งค่า QR รับเงิน' });

  const st = alert.streamerSettings(streamer.id);
  if (!st.donations_enabled) return res.status(403).json({ error: 'สตรีมเมอร์ปิดรับโดเนทชั่วคราว' });
  const stickerCode = req.body.sticker_code ? String(req.body.sticker_code) : null;
  if (stickerCode && !st.stickers_enabled) return res.status(403).json({ error: 'สตรีมเมอร์ปิดรับสติกเกอร์อยู่' });
  const sticker = alert.getSticker(stickerCode);
  if (stickerCode && !sticker) return res.status(400).json({ error: 'สติกเกอร์ไม่ถูกต้องหรือถูกปิดใช้งาน' });
  // ส่งสติกเกอร์ = ยอดเท่าราคาสติกเกอร์ แนบข้อความไม่ได้
  const stickerOnly = !!sticker;
  let amount;
  if (stickerOnly) {
    amount = sticker.cost;
  } else {
    amount = Math.floor(Number(req.body.amount));
    const minD = st.min_donation || 1, maxD = st.max_donation || 1000;
    if (!Number.isFinite(amount) || amount < minD || amount > maxD) {
      return res.status(400).json({ error: `จำนวนเงินต้องอยู่ระหว่าง ${minD} - ${maxD} บาท` });
    }
  }
  if (amount < 1) return res.status(400).json({ error: 'จำนวนเงินไม่ถูกต้อง' });
  const display_name = clean(req.body.display_name || (user && (user.display_name || user.username)) || '', 40);
  if (!display_name) return res.status(400).json({ error: 'กรุณาใส่ชื่อของคุณ' });
  const message = stickerOnly ? '' : clean(req.body.message || '', 200);

  // แนบคลิปเสียง/ไฟล์เพลงได้ก็ต่อเมื่อสตรีมเมอร์เปิดใช้และยอดถึงขั้นต่ำ (ไม่ผ่าน = ไม่แนบ ไม่ทำให้โดเนทล้ม)
  let voice_url = null, audio_url = null;
  if (!stickerOnly && st.voice_msg_enabled && amount >= (st.voice_msg_min_amount || 1) && req.body.voice_clip) {
    voice_url = alert.saveMediaClip(req.body.voice_clip, { maxBytes: 2 * 1024 * 1024, allowedExt: ['webm', 'ogg', 'wav', 'mp3', 'mpeg'] });
  }
  if (!stickerOnly && st.audio_msg_enabled && amount >= (st.audio_msg_min_amount || 1) && req.body.audio_clip) {
    audio_url = alert.saveMediaClip(req.body.audio_clip, { maxBytes: 8 * 1024 * 1024, allowedExt: ['mp3', 'mpeg', 'wav', 'ogg'] });
  }

  qr.cleanupStale();
  const reference = 'DN-' + token(6).toUpperCase();
  const payToken = token(16);
  const created = now();
  const expires = created + qr.QR_TTL;
  db.prepare(`INSERT INTO donation_intents
    (reference, pay_token, streamer_user_id, donor_user_id, amount, display_name, message, sticker_code, sticker_only,
     voice_url, audio_url, hide_email, promptpay_tag, promptpay_value, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    reference, payToken, streamer.id, user ? user.id : null, amount, display_name, message, sticker ? sticker.code : null,
    stickerOnly ? 1 : 0, voice_url, audio_url, user && req.body.hide_email ? 1 : 0, target.tag, target.value, created, expires);

  res.json({
    ok: true, reference, pay_token: payToken, amount, expires_at: expires,
    qr: promptpay.payloadFor(target, amount),
    account_name: streamer.promptpay_name || '', account_masked: promptpay.masked(target),
    auto_check: slipVerify.enabled(),
  });
});

function findIntent(req) {
  const it = db.prepare('SELECT * FROM donation_intents WHERE reference = ?').get(String(req.params.ref || ''));
  const t = String((req.body && req.body.t) || req.query.t || '');
  return it && t && it.pay_token === t ? it : null;
}

router.get('/:ref', (req, res) => {
  const it = findIntent(req);
  if (!it) return res.status(404).json({ error: 'ไม่พบรายการโดเนท' });
  res.json({
    status: qr.viewStatus(it), amount: it.amount, expires_at: it.expires_at,
    accepts_slip: qr.acceptsSlip(it), note: it.status === 'rejected' ? it.note : undefined,
  });
});

const busy = new Set();

router.post('/:ref/slip', slipLimiter, async (req, res) => {
  const it = findIntent(req);
  if (!it) return res.status(404).json({ error: 'ไม่พบรายการโดเนท' });
  if (it.status === 'completed') return res.json({ ok: true, status: 'completed', amount: it.amount });
  if (it.status === 'review') return res.json({ ok: true, status: 'review' });
  if (!qr.acceptsSlip(it)) return res.status(400).json({ error: 'รายการนี้ไม่รับสลิปแล้ว' });
  const img = slips.decodeSlip(req.body.slip);
  if (img.error) return res.status(400).json({ error: img.error });
  if (busy.has(it.id)) return res.status(409).json({ error: 'กำลังตรวจสลิปของรายการนี้อยู่' });

  busy.add(it.id);
  try {
    const streamer = db.prepare('SELECT promptpay_bank_account, promptpay_name FROM users WHERE id = ?').get(it.streamer_user_id) || {};
    const v = await slipVerify.evaluate(req.body.slip, {
      amount: it.amount, createdAt: it.created_at,
      // เทียบกับ QR ที่ใช้ตอนสร้างรายการ (สตรีมเมอร์เปลี่ยน QR ระหว่างทาง ก็ยังตรวจกับบัญชีที่ผู้ชมโอนจริง)
      forms: promptpay.receiverForms({ tag: it.promptpay_tag, value: it.promptpay_value }, streamer.promptpay_bank_account),
      receiverLabel: 'บัญชีพร้อมเพย์ของสตรีมเมอร์',
      // มีระบบตรวจสลิป = ตัดสินอัตโนมัติทุกกรณี ไม่ต้องให้สตรีมเมอร์กดยืนยัน
      auto: slipVerify.enabled(), expectedName: streamer.promptpay_name || '',
    });
    if (v.kind === 'invalid' || v.kind === 'retry') return res.status(400).json({ error: v.error });

    // ยอดในสลิปต่างจากที่กรอก: โดเนทเงิน = ใช้ยอดที่โอนจริง / สติกเกอร์ = ต้องจ่ายครบราคา
    let paid = it.amount;
    if (v.kind === 'ok' && Math.abs(v.paidAmount - it.amount) > 0.001) {
      paid = Math.floor(v.paidAmount);
      if (it.sticker_only && paid < it.amount) {
        return res.status(400).json({ error: `ยอดในสลิป ฿${v.paidAmount} น้อยกว่าราคาสติกเกอร์ ฿${it.amount}` });
      }
      if (paid < 1) return res.status(400).json({ error: `ยอดในสลิป ฿${v.paidAmount} น้อยเกินไป` });
    }

    const saved = slips.saveSlip(it.id, req.body.slip, 'd');
    let donation = null;
    try {
      if (v.kind === 'ok') {
        donation = qr.complete(it.id, {
          trans_ref: v.transRef, slip_file: saved.file, amount: paid,
          note: paid === it.amount ? 'ตรวจสลิปอัตโนมัติ' : `ตรวจสลิปอัตโนมัติ (ยอดโอนจริง ฿${v.paidAmount} แทน ฿${it.amount})`,
        });
        if (!donation) { slips.removeSlip(saved.file); return res.status(409).json({ error: 'รายการนี้ถูกดำเนินการไปแล้ว' }); }
      } else {
        const r = db.prepare(`UPDATE donation_intents SET status = 'review', slip_file = ?, trans_ref = ?, note = ?
          WHERE id = ? AND status = 'pending'`).run(saved.file, v.transRef || null, v.reason, it.id);
        if (!r.changes) { slips.removeSlip(saved.file); return res.status(409).json({ error: 'รายการนี้ถูกดำเนินการไปแล้ว' }); }
      }
    } catch (e) {
      slips.removeSlip(saved.file);
      if (/UNIQUE constraint failed/i.test(String(e.message))) return res.status(400).json({ error: 'สลิปนี้ถูกใช้ไปแล้ว' });
      throw e;
    }
    if (donation) {
      await alert.deliver(req.app.get('io'), donation);
      return res.json({ ok: true, status: 'completed', amount: donation.amount });
    }
    notify.qrDonationNeedsReview(it, v.reason);
    res.json({ ok: true, status: 'review' });
  } finally {
    busy.delete(it.id);
  }
});

// ---------- สตรีมเมอร์: สลิปที่ระบบตรวจอัตโนมัติไม่ผ่าน → เช็คในแอปธนาคารแล้วกดยืนยัน/ปฏิเสธเอง ----------
const manage = express.Router();
manage.use(requireAuth, requireRole('streamer', 'admin'));

manage.get('/list', (req, res) => {
  res.json(db.prepare(`SELECT id, reference, amount, display_name, message, sticker_code, status, note, trans_ref,
      slip_file IS NOT NULL AS has_slip, created_at, completed_at
    FROM donation_intents WHERE streamer_user_id = ? AND slip_file IS NOT NULL
      AND (status IN ('review', 'rejected') OR (status = 'completed' AND note = 'สตรีมเมอร์ยืนยันเอง'))
    ORDER BY (status = 'review') DESC, id DESC LIMIT 100`).all(req.user.id));
});

function ownIntent(req) {
  return db.prepare('SELECT * FROM donation_intents WHERE id = ? AND streamer_user_id = ?').get(req.params.id, req.user.id);
}

manage.get('/:id/slip', (req, res) => {
  const it = ownIntent(req);
  slips.sendSlip(res, it && it.slip_file);
});

manage.post('/:id/process', async (req, res) => {
  const it = ownIntent(req);
  if (!it) return res.status(404).json({ error: 'ไม่พบรายการ' });
  if (it.status !== 'review') return res.status(400).json({ error: 'รายการนี้ถูกดำเนินการแล้ว' });
  if (req.body.status === 'rejected') {
    const note = clean(req.body.note || '', 200) || 'ไม่พบยอดเงินเข้าบัญชี';
    db.prepare("UPDATE donation_intents SET status = 'rejected', note = ? WHERE id = ? AND status = 'review'").run(note, it.id);
    return res.json({ ok: true });
  }
  const donation = qr.complete(it.id, { note: 'สตรีมเมอร์ยืนยันเอง' });
  if (!donation) return res.status(409).json({ error: 'รายการนี้ถูกดำเนินการไปแล้ว' });
  await alert.deliver(req.app.get('io'), donation);
  res.json({ ok: true });
});

router.use('/manage', manage);

module.exports = router;
