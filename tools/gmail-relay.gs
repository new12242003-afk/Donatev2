// ตัวส่งอีเมลผ่าน Gmail ของคุณเอง สำหรับเว็บที่รันบน Railway (แพลน Free/Hobby บล็อกพอร์ต SMTP)
// เซิร์ฟเวอร์ส่งคำขอมาที่สคริปต์นี้ทาง HTTPS แล้วสคริปต์ส่งอีเมลออกจาก Gmail ของเจ้าของสคริปต์
// วิธีติดตั้งอยู่ใน README หัวข้อ "ส่งอีเมลผ่าน Google Apps Script"
//
// ใส่รหัสลับเดียวกับตัวแปร GMAIL_SCRIPT_SECRET บน Railway (ห้ามบอกใคร ใครรู้รหัสนี้ + URL จะส่งอีเมลในชื่อคุณได้)
const SECRET = 'ใส่รหัสลับที่นี่';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (SECRET === 'ใส่รหัสลับที่นี่' || d.secret !== SECRET) return reply({ ok: false, error: 'รหัสลับไม่ถูกต้อง' });
    // เซิร์ฟเวอร์เช็คการตั้งค่าตอนเปิดเครื่อง ไม่ต้องส่งอีเมลจริง
    if (d.ping) return reply({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
    MailApp.sendEmail({ to: d.to, subject: d.subject, htmlBody: d.html, name: d.name || 'Donate Stream' });
    return reply({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err) });
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// กด Run ฟังก์ชันนี้ในหน้า Apps Script หนึ่งครั้ง เพื่อกดอนุญาตสิทธิ์ส่งอีเมล และทดลองส่งหาตัวเอง
function testSend() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), 'ทดสอบตัวส่งอีเมล Donate Stream', 'ถ้าได้รับอีเมลนี้ แปลว่าสคริปต์ส่งอีเมลได้แล้ว');
}
