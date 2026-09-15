const { db } = require('./db');
const { now } = require('./util');

// บันทึกรายการเดินบัญชี (ledger)
function addLedger(userId, type, amount, balanceAfter, refType, refId, note) {
  db.prepare(`INSERT INTO transactions (user_id, type, amount, balance_after, ref_type, ref_id, note, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, type, amount, balanceAfter ?? null, refType || null, refId || null, note || null, now());
}

module.exports = { addLedger };
