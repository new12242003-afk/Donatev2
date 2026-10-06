const { db } = require('./db');
const { clean } = require('./util');

// บัญชีรับเงินสำหรับถอนรายได้ — บันทึกไว้ต่อช่องทาง (bank / promptpay / truemoney) ในคอลัมน์ users.payout_accounts (JSON)
const BANKS = [
  'ธนาคารกรุงเทพ', 'ธนาคารกสิกรไทย', 'ธนาคารไทยพาณิชย์', 'ธนาคารกรุงไทย', 'ธนาคารกรุงศรีอยุธยา',
  'ธนาคารทหารไทยธนชาต', 'ธนาคารออมสิน', 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร', 'ธนาคารอาคารสงเคราะห์',
  'ธนาคารซีไอเอ็มบีไทย', 'ธนาคารยูโอบี', 'ธนาคารเกียรตินาคินภัทร',
];
const METHODS = {
  bank: { label: 'ธนาคาร', numberLabel: 'เลขบัญชี' },
  promptpay: { label: 'พร้อมเพย์', numberLabel: 'หมายเลขพร้อมเพย์' },
  truemoney: { label: 'TrueMoney Wallet', numberLabel: 'เบอร์ทรูมันนี่วอลเล็ท' },
};

function getAccounts(userId) {
  const row = db.prepare('SELECT payout_accounts FROM users WHERE id = ?').get(userId);
  try { return JSON.parse((row && row.payout_accounts) || '{}') || {}; } catch { return {}; }
}

// ตรวจและทำความสะอาดข้อมูลก่อนบันทึก — คืน { error } หรือ { account }
function validate(method, b) {
  if (!METHODS[method]) return { error: 'ช่องทางรับเงินไม่ถูกต้อง' };
  const number = String(b.number || '').replace(/[\s-]/g, '');
  const first_name = clean(b.first_name || '', 40);
  const last_name = clean(b.last_name || '', 40);
  if (!first_name || !last_name) return { error: 'กรุณากรอกชื่อและนามสกุลผู้รับ' };
  const account = { number, first_name, last_name };
  if (method === 'bank') {
    if (!BANKS.includes(b.bank)) return { error: 'กรุณาเลือกธนาคาร' };
    if (!/^\d{10,15}$/.test(number)) return { error: 'เลขบัญชีต้องเป็นตัวเลข 10-15 หลัก' };
    account.bank = b.bank;
  } else if (method === 'promptpay') {
    if (!/^(0\d{9}|\d{13})$/.test(number)) return { error: 'หมายเลขพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก' };
  } else if (method === 'truemoney') {
    if (!/^0\d{9}$/.test(number)) return { error: 'เบอร์ทรูมันนี่วอลเล็ทต้องเป็นเบอร์มือถือ 10 หลัก' };
  }
  return { account };
}

function save(userId, method, account) {
  const all = getAccounts(userId);
  all[method] = account;
  db.prepare('UPDATE users SET payout_accounts = ? WHERE id = ?').run(JSON.stringify(all), userId);
  return all;
}

// ข้อความเก็บลง payouts.account_detail (แอดมินใช้โอนเงิน)
function describe(method, a) {
  const who = `${a.first_name} ${a.last_name}`;
  if (method === 'bank') return `${a.bank} • ${a.number} • ${who}`;
  return `${METHODS[method].label} • ${a.number} • ${who}`;
}

module.exports = { BANKS, METHODS, getAccounts, validate, save, describe };
