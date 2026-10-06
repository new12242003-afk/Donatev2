const nodemailer = require('nodemailer');

let transporter = null;

if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
} else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

const FROM = process.env.MAIL_FROM || process.env.GMAIL_USER || process.env.SMTP_USER || 'no-reply@donate.local';

// ตรวจ login Gmail/SMTP ตอนเปิดเซิร์ฟเวอร์ — ถ้ารหัสผิดจะเห็นในคอนโซลทันที ไม่ต้องรอมีคนสมัคร
function checkMailer() {
  if (!transporter) {
    console.log('  [MAIL] ยังไม่ได้ตั้งค่า GMAIL_USER / GMAIL_APP_PASSWORD — ' + (require('./config').SHOW_DEV_CODES ? 'ระบบจะแสดงรหัส/ลิงก์ยืนยันบนหน้าเว็บแทน (โหมดทดสอบ)' : 'สมัครสมาชิก/ลืมรหัสผ่านจะใช้ไม่ได้จนกว่าจะตั้งค่า'));
    return;
  }
  transporter.verify()
    .then(() => console.log('  [MAIL] เชื่อมต่อส่งอีเมลสำเร็จ (' + FROM + ')'))
    .catch((e) => console.error('  [MAIL] เชื่อมต่อส่งอีเมลไม่สำเร็จ: ' + e.message
      + '\n         ตรวจ GMAIL_USER / GMAIL_APP_PASSWORD ใน .env'));
}

async function sendVerifyEmail(to, link) {
  if (!transporter) {
    console.log(`\n[MAIL ปิดอยู่] ลิงก์ยืนยันของ ${to}:\n  ${link}\n`);
    return { sent: false, link };
  }
  try {
    await transporter.sendMail({
      from: FROM,
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
    console.error(`[MAIL] ส่งอีเมลยืนยันไปที่ ${to} ไม่สำเร็จ: ${e.message}\n  ลิงก์ยืนยัน: ${link}`);
    throw e;
  }
  return { sent: true };
}

// รหัสยืนยัน 6 หลักตอนสมัครสมาชิก
async function sendCodeEmail(to, code, purpose = 'register') {
  const forWhat = purpose === 'reset' ? 'ตั้งรหัสผ่านใหม่' : 'สมัครสมาชิก';
  if (!transporter) {
    console.log(`\n[MAIL ปิดอยู่] รหัสยืนยันของ ${to}: ${code}\n`);
    return { sent: false };
  }
  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: `รหัสยืนยันของคุณคือ ${code} · Donate Stream`,
      html: `
        <div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:480px;margin:auto">
          <h2>รหัสยืนยันอีเมล</h2>
          <p>ใช้รหัสนี้เพื่อ${forWhat} Donate Stream</p>
          <div style="font-size:34px;font-weight:700;letter-spacing:8px;background:#f4f5f9;border-radius:10px;padding:16px;text-align:center">${code}</div>
          <p style="color:#999;font-size:12px">รหัสหมดอายุใน 10 นาที — ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร</p>
        </div>`,
    });
  } catch (e) {
    console.error(`[MAIL] ส่งรหัสยืนยันไปที่ ${to} ไม่สำเร็จ: ${e.message}`);
    throw e;
  }
  return { sent: true };
}

module.exports = { sendVerifyEmail, sendCodeEmail, checkMailer, mailEnabled: () => !!transporter };
