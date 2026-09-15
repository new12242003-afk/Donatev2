const { db } = require('./db');
const { now } = require('./util');

// ฟิลด์ยอดเงินที่อนุญาตให้แก้ไขผ่าน credit/debit เท่านั้น (กันไม่ให้ชื่อคอลัมน์ที่ interpolate เข้า SQL มาจากภายนอกได้)
const BALANCE_FIELDS = ['token_balance', 'earnings_balance'];

function assertField(field) {
  if (!BALANCE_FIELDS.includes(field)) throw new Error('invalid ledger field: ' + field);
}

// บันทึกรายการเดินบัญชี (ledger) — ใช้ภายใน credit/debit เท่านั้น ไม่ควรเรียกตรงๆ จากนอกไฟล์นี้
function addLedger(userId, type, amount, balanceAfter, refType, refId, note) {
  db.prepare(`INSERT INTO transactions (user_id, type, amount, balance_after, ref_type, ref_id, note, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, type, amount, balanceAfter ?? null, refType || null, refId || null, note || null, now());
}

// เพิ่มยอดให้ผู้ใช้คนเดียว ไม่ตรวจสอบขั้นต่ำ (ใช้กับ topup, คืนเงิน, หรือแอดมินปรับยอด — ปรับติดลบได้ตรงตามที่ระบุ)
// ต้องเรียกภายใน db.transaction() ของผู้เรียกเสมอ เพื่อให้ atomic กับการเขียนตารางอื่นในธุรกรรมเดียวกัน
function credit(userId, field, amount, type, refType, refId, note) {
  assertField(field);
  db.prepare(`UPDATE users SET ${field} = ${field} + ? WHERE id = ?`).run(amount, userId);
  const balance = db.prepare(`SELECT ${field} AS v FROM users WHERE id = ?`).get(userId).v;
  addLedger(userId, type, amount, balance, refType, refId, note);
  return balance;
}

// หักยอดผู้ใช้คนเดียว โยน Error({ code: 'INSUFFICIENT_BALANCE' }) ถ้ายอดไม่พอ
// ต้องเรียกภายใน db.transaction() ของผู้เรียกเสมอ
function debit(userId, field, amount, type, refType, refId, note) {
  assertField(field);
  const row = db.prepare(`SELECT ${field} AS v FROM users WHERE id = ?`).get(userId);
  if (!row || row.v < amount) {
    const err = new Error('ยอดเงินไม่เพียงพอ');
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }
  db.prepare(`UPDATE users SET ${field} = ${field} - ? WHERE id = ?`).run(amount, userId);
  const balance = db.prepare(`SELECT ${field} AS v FROM users WHERE id = ?`).get(userId).v;
  addLedger(userId, type, -amount, balance, refType, refId, note);
  return balance;
}

// ย้ายเงินระหว่างผู้ใช้สองคนเป็นชุดเดียว (debit ฝั่งหนึ่ง + credit อีกฝั่ง) — จำนวนสองฝั่งไม่จำเป็นต้องเท่ากัน
// (เช่นโดเนท: ผู้โดเนทถูกหักเต็มจำนวน แต่สตรีมเมอร์ได้รับหลังหักค่าธรรมเนียมแพลตฟอร์ม)
// ต้องเรียกภายใน db.transaction() ของผู้เรียกเสมอ
function transfer({ fromUserId, fromField, fromAmount, fromType, fromNote,
                     toUserId, toField, toAmount, toType, toNote, refType, refId }) {
  const fromBalance = debit(fromUserId, fromField, fromAmount, fromType, refType, refId, fromNote);
  const toBalance = credit(toUserId, toField, toAmount, toType, refType, refId, toNote);
  return { fromBalance, toBalance };
}

module.exports = { credit, debit, transfer };
