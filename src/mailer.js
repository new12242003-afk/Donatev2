const nodemailer = require('nodemailer');

// ช่องทางส่งอีเมล เรียงตามลำดับที่เลือกก่อน:
// 1) Brevo API  (BREVO_API_KEY)  — ส่งผ่าน HTTPS ใช้บน Railway แพลน Free/Hobby ได้ (Railway บล็อกพอร์ต SMTP ยกเว้นแพลน Pro)
// 2) Resend API (RESEND_API_KEY) — ส่งผ่าน HTTPS เหมือนกัน แต่ต้องยืนยันโดเมนของตัวเองก่อนถึงจะส่งหาคนอื่นได้
// 3) SMTP / Gmail — ใช้ได้บนเครื่องตัวเอง หรือโฮสต์ที่ไม่บล็อกพอร์ต SMTP
const BREVO_KEY = process.env.BREVO_API_KEY || '';
const RESEND_KEY = process.env.RESEND_API_KEY || '';

let transporter = null;
// ตั้ง timeout สั้นลง (ค่าเริ่มต้นของ nodemailer คือ 2 นาที) — ถ้าพอร์ตถูกบล็อก ผู้ใช้จะได้ไม่ต้องรอนาน
const SMTP_TIMEOUTS = { connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000 };

if (!BREVO_KEY && !RESEND_KEY) {
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      ...SMTP_TIMEOUTS,
    });
  } else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      ...SMTP_TIMEOUTS,
    });
  }
}

const PROVIDER = BREVO_KEY ? 'Brevo' : RESEND_KEY ? 'Resend' : transporter ? 'SMTP' : '';
const FROM = process.env.MAIL_FROM || process.env.GMAIL_USER || process.env.SMTP_USER || 'no-reply@donate.local';

// แยก "ชื่อ <email>" ออกเป็น { name, email } สำหรับ Brevo
function parseFrom(s) {
  const m = String(s).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: String(s).trim() };
}

async function apiPost(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text.slice(0, 300)}`);
  }
}

async function send({ to, subject, html }) {
  if (BREVO_KEY) {
    return apiPost('https://api.brevo.com/v3/smtp/email', { 'api-key': BREVO_KEY },
      { sender: parseFrom(FROM), to: [{ email: to }], subject, htmlContent: html });
  }
  if (RESEND_KEY) {
    return apiPost('https://api.resend.com/emails', { authorization: `Bearer ${RESEND_KEY}` },
      { from: FROM, to: [to], subject, html });
  }
  return transporter.sendMail({ from: FROM, to, subject, html });
}

// ตรวจการตั้งค่าอีเมลตอนเปิดเซิร์ฟเวอร์ — ถ้ารหัสผิดจะเห็นในคอนโซลทันที ไม่ต้องรอมีคนสมัคร
function checkMailer() {
  if (!PROVIDER) {
    console.log('  [MAIL] ยังไม่ได้ตั้งค่า BREVO_API_KEY หรือ GMAIL_USER / GMAIL_APP_PASSWORD — ' + (require('./config').SHOW_DEV_CODES ? 'ระบบจะแสดงรหัส/ลิงก์ยืนยันบนหน้าเว็บแทน (โหมดทดสอบ)' : 'สมัครสมาชิก/ลืมรหัสผ่านจะใช้ไม่ได้จนกว่าจะตั้งค่า'));
    return;
  }
  if (BREVO_KEY) {
    fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': BREVO_KEY, accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
      .then((r) => {
        if (r.ok) console.log('  [MAIL] เชื่อมต่อ Brevo สำเร็จ (' + FROM + ')');
        else console.error('  [MAIL] Brevo ตอบกลับ HTTP ' + r.status + ' — ตรวจ BREVO_API_KEY');
      })
      .catch((e) => console.error('  [MAIL] เชื่อมต่อ Brevo ไม่สำเร็จ: ' + e.message));
    return;
  }
  if (RESEND_KEY) {
    console.log('  [MAIL] ส่งอีเมลผ่าน Resend (' + FROM + ')');
    return;
  }
  transporter.verify()
    .then(() => console.log('  [MAIL] เชื่อมต่อส่งอีเมลสำเร็จ (' + FROM + ')'))
    .catch((e) => console.error('  [MAIL] เชื่อมต่อส่งอีเมลไม่สำเร็จ: ' + e.message
      + '\n         ตรวจ GMAIL_USER / GMAIL_APP_PASSWORD ใน .env'
      + '\n         ถ้ารันบน Railway (แพลน Free/Hobby) พอร์ต SMTP ถูกบล็อก ให้ใช้ BREVO_API_KEY แทน'));
}

async function sendVerifyEmail(to, link) {
  if (!PROVIDER) {
    console.log(`\n[MAIL ปิดอยู่] ลิงก์ยืนยันของ ${to}:\n  ${link}\n`);
    return { sent: false, link };
  }
  try {
    await send({
      to,
      subject: 'ยืนยันอีเมลของคุณ · Donate Stream',
      html: `
        <div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:480px;margin:auto">
          <h2>ยืนยันอีเมล</h2>
          <p>คลิกปุ่มด้านล่างเพื่อยืนยันอีเมลและเริ่มใช้งาน Donate Stream</p>
          <p><a href="${link}" style="background:#0a0a0b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">ยืนยันอีเมล</a></p>
          <p style="color:#666;font-size:13px">หรือเปิดลิงก์นี้: <br>${link}</p>
          <p style="color:#999;font-size:12px">ลิงก์หมดอายุใน 24 ชั่วโมง</p>
        </div>`,
    });
  } catch (e) {
    console.error(`[MAIL] ส่งอีเมลยืนยันไปที่ ${to} ไม่สำเร็จ (${PROVIDER}): ${e.message}\n  ลิงก์ยืนยัน: ${link}`);
    throw e;
  }
  return { sent: true };
}

// รหัสยืนยัน 6 หลักตอนสมัครสมาชิก
async function sendCodeEmail(to, code, purpose = 'register') {
  const forWhat = purpose === 'reset' ? 'ตั้งรหัสผ่านใหม่' : 'สมัครสมาชิก';
  if (!PROVIDER) {
    console.log(`\n[MAIL ปิดอยู่] รหัสยืนยันของ ${to}: ${code}\n`);
    return { sent: false };
  }
  try {
    await send({
      to,
      subject: `รหัสยืนยันของคุณคือ ${code} · Donate Stream`,
      html: `
        <div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:480px;margin:auto">
          <h2>รหัสยืนยันอีเมล</h2>
          <p>ใช้รหัสนี้เพื่อ${forWhat} Donate Stream</p>
          <div style="font-size:34px;font-weight:700;letter-spacing:8px;background:#f4f5f9;border-radius:10px;padding:16px;text-align:center">${code}</div>
          <p style="color:#dc2626;font-size:14px;font-weight:700">รหัสหมดอายุใน 5 นาที</p>
          <p style="color:#999;font-size:12px">ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร</p>
        </div>`,
    });
  } catch (e) {
    console.error(`[MAIL] ส่งรหัสยืนยันไปที่ ${to} ไม่สำเร็จ (${PROVIDER}): ${e.message}`);
    throw e;
  }
  return { sent: true };
}

module.exports = { sendVerifyEmail, sendCodeEmail, checkMailer, mailEnabled: () => !!PROVIDER };
