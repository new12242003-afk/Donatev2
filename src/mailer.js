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

async function sendVerifyEmail(to, link) {
  if (!transporter) {
    console.log(`\n[MAIL ปิดอยู่] ลิงก์ยืนยันของ ${to}:\n  ${link}\n`);
    return { sent: false, link };
  }
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
  return { sent: true };
}

module.exports = { sendVerifyEmail, mailEnabled: () => !!transporter };
