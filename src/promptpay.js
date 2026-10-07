// QR PromptPay (มาตรฐาน EMVCo / Thai QR Payment)
// - สร้าง QR ระบุยอดเงิน: แอปธนาคารทุกแห่ง + แอป TrueMoney สแกนจ่ายได้ เงินเข้าบัญชีพร้อมเพย์ปลายทางโดยตรง
// - อ่าน QR รับเงินที่สตรีมเมอร์อัปโหลด (จากแอปธนาคาร) เพื่อเอาหมายเลขพร้อมเพย์มาสร้าง QR ใส่ยอดโดเนท
//
// target = ช่องผู้รับในแท็ก 29 ของ QR: { tag, value }
//   01 = เบอร์มือถือ (0066xxxxxxxxx), 02 = เลขบัตรประชาชน/ผู้เสียภาษี 13 หลัก, 03 = e-Wallet ID 15 หลัก,
//   04 = บัญชีธนาคาร (รหัสธนาคาร 3 หลัก + เลขบัญชี)

const PROMPTPAY_AID = 'A000000677010111';
const TARGET_FORMAT = { '01': /^0066\d{9}$/, '02': /^\d{13}$/, '03': /^\d{15}$/, '04': /^\d{3}\d{6,15}$/ };

function tlv(tag, value) {
  return tag + String(value.length).padStart(2, '0') + value;
}

// แยก TLV ชั้นเดียว → { tag: value } หรือ null ถ้ารูปแบบเสีย
function parseTlv(s) {
  const out = {};
  let i = 0;
  while (i < s.length) {
    const tag = s.substr(i, 2), len = Number(s.substr(i + 2, 2));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len) || i + 4 + len > s.length) return null;
    out[tag] = s.substr(i + 4, len);
    i += 4 + len;
  }
  return out;
}

// CRC-16/CCITT-FALSE (init 0xFFFF, poly 0x1021) ตามที่ EMVCo กำหนด
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// หมายเลขที่พิมพ์เอง: เบอร์มือถือ 10 หลัก (0xxxxxxxxx) / เลขบัตรประชาชน-เลขผู้เสียภาษี 13 หลัก / e-Wallet ID 15 หลัก
function parseTarget(id) {
  const d = String(id || '').replace(/\D/g, '');
  if (/^0\d{9}$/.test(d)) return { tag: '01', value: '0066' + d.slice(1), type: 'phone', digits: d };
  if (/^\d{13}$/.test(d)) return { tag: '02', value: d, type: 'national_id', digits: d };
  if (/^\d{15}$/.test(d)) return { tag: '03', value: d, type: 'ewallet', digits: d };
  return null;
}

function validTarget(t) {
  return !!(t && TARGET_FORMAT[t.tag] && TARGET_FORMAT[t.tag].test(String(t.value)));
}

// amountBaht = null → QR รับเงินแบบไม่ระบุยอด (ผู้จ่ายพิมพ์ยอดเอง) เหมือน QR ในแอปธนาคาร
function payloadFor(target, amountBaht) {
  if (!validTarget(target)) throw new Error('หมายเลขพร้อมเพย์ไม่ถูกต้อง');
  const fixed = amountBaht != null;
  const data = [
    tlv('00', '01'),
    tlv('01', fixed ? '12' : '11'), // 12 = ใช้ครั้งเดียวแบบระบุยอด / 11 = ใช้ซ้ำได้ ไม่ระบุยอด
    tlv('29', tlv('00', PROMPTPAY_AID) + tlv(target.tag, target.value)),
    tlv('53', '764'), // THB
    fixed ? tlv('54', Number(amountBaht).toFixed(2)) : '',
    tlv('58', 'TH'),
  ].join('') + '6304';
  return data + crc16(data);
}

function payload(id, amountBaht) {
  const target = parseTarget(id);
  if (!target) throw new Error('PROMPTPAY_ID ไม่ถูกต้อง (ต้องเป็นเบอร์มือถือ 10 หลัก, เลขบัตรประชาชน 13 หลัก หรือ e-Wallet ID 15 หลัก)');
  return payloadFor(target, amountBaht);
}

// ข้อความที่อ่านได้จาก QR รับเงิน → { target } หรือ { error }
function decode(str) {
  const s = String(str || '').trim();
  const crcAt = s.length - 8;
  if (s.length < 30 || s.slice(crcAt, crcAt + 4) !== '6304') return { error: 'QR นี้ไม่ใช่ QR พร้อมเพย์ / Thai QR Payment' };
  if (crc16(s.slice(0, crcAt + 4)) !== s.slice(crcAt + 4).toUpperCase()) return { error: 'อ่าน QR ได้ไม่ครบ (checksum ไม่ตรง) กรุณาใช้รูปที่ชัดกว่านี้' };
  const top = parseTlv(s.slice(0, crcAt));
  if (!top) return { error: 'QR นี้ไม่ใช่ QR พร้อมเพย์ / Thai QR Payment' };
  const pp = top['29'] && parseTlv(top['29']);
  if (!pp || pp['00'] !== PROMPTPAY_AID) {
    if (top['30']) return { error: 'นี่คือ QR ร้านค้า (Bill Payment) ซึ่งยังไม่รองรับ — กรุณาใช้ QR พร้อมเพย์ "รับเงิน" จากแอปธนาคาร' };
    return { error: 'QR นี้ไม่ใช่ QR พร้อมเพย์รับเงิน' };
  }
  for (const tag of ['01', '02', '03', '04']) {
    if (pp[tag] !== undefined) {
      const target = { tag, value: pp[tag] };
      return validTarget(target) ? { target } : { error: 'หมายเลขพร้อมเพย์ใน QR ไม่ถูกต้อง' };
    }
  }
  return { error: 'ไม่พบหมายเลขพร้อมเพย์ใน QR' };
}

// หมายเลขแบบที่คนอ่าน: เบอร์ 0812345678 / เลขบัตร / e-Wallet / บัญชี (รหัสธนาคาร-เลขบัญชี)
function display(target) {
  if (!target) return '';
  if (target.tag === '01') return '0' + target.value.slice(4);
  if (target.tag === '04') return target.value.slice(0, 3) + '-' + target.value.slice(3);
  return target.value;
}

// ปิดบางส่วนสำหรับแสดงต่อสาธารณะ เช่น 081-xxx-5678
function masked(target) {
  const d = display(target).replace(/\D/g, '');
  if (!d) return '';
  return d.slice(0, 3) + 'x'.repeat(Math.max(0, d.length - 7)) + d.slice(-4);
}

// รูปแบบตัวเลขที่อาจโผล่ในสลิปฝั่งผู้รับ ใช้เทียบว่าโอนเข้าบัญชีนี้จริง (slipVerify.checkReceiver)
function receiverForms(target, bankAccount = '') {
  const proxy = [], account = [];
  if (validTarget(target)) {
    if (target.tag === '01') {
      const local = display(target);
      proxy.push(local, '66' + local.slice(1), target.value);
    } else if (target.tag === '04') {
      proxy.push(target.value);
      account.push(target.value.slice(3));
    } else {
      proxy.push(target.value);
    }
  }
  const bank = String(bankAccount || '').replace(/\D/g, '');
  if (bank) account.push(bank);
  return { proxy, account };
}

module.exports = { payload, payloadFor, parseTarget, validTarget, decode, display, masked, receiverForms, crc16 };
