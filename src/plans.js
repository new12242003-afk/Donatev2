const { db, getConfig, setConfigValue } = require('./db');
const ledger = require('./ledger');
const { now } = require('./util');

// แพลนการใช้งาน — สมัครสมาชิกแล้วใช้ฟรี 21 วัน หลังจากนั้นซื้อแพลนด้วย Token เพื่อให้รับโดเนทต่อได้
// หมดอายุ = สตรีมเมอร์รับโดเนทไม่ได้ (ผู้โดเนท/ผู้ชมใช้งานได้ปกติ, แอดมินไม่มีวันหมดอายุ)
const DAY = 24 * 60 * 60 * 1000;
const TRIAL_DAYS = 21;
const PLANS = [
  { id: '1m', label: '1 เดือน', days: 30, months: 1, price: 20 },
  { id: '3m', label: '3 เดือน', days: 90, months: 3, price: 59 },
  { id: '6m', label: '6 เดือน', days: 180, months: 6, price: 109 },
  { id: '1y', label: '1 ปี', days: 365, months: 12, price: 200, recommended: true },
];

// ประวัติการซื้อก่อนมีตาราง plan_purchases อยู่แค่ใน ledger (transactions) — ย้ายมาครั้งเดียว
// ช่วงเวลาของรายการเก่าเดาย้อนหลังจากวันหมดอายุจริงของบัญชี (ดู fillMissingDates)
if (getConfig('plan_purchases_backfilled', '') !== '1') {
  const old = db.prepare("SELECT user_id, amount, note, created_at FROM transactions WHERE type = 'plan_purchase' ORDER BY id").all();
  const ins = db.prepare(`INSERT INTO plan_purchases (user_id, plan_id, label, days, price, starts_at, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`);
  old.forEach((t) => {
    const plan = PLANS.find((p) => String(t.note || '').endsWith(p.label)) || {};
    ins.run(t.user_id, plan.id || '', plan.label || String(t.note || '').replace('ซื้อแพลน ', ''), plan.days || 0, -t.amount, t.created_at);
  });
  setConfigValue('plan_purchases_backfilled', '1');
}

// เติมช่วงเวลาให้รายการที่ย้ายมาจาก ledger: ไล่ย้อนจากวันหมดอายุของบัญชี — แพลนล่าสุดจบที่ plan_expires_at,
// แต่ละแพลนเริ่มที่ (วันจบ - จำนวนวัน) และจบตรงจุดเริ่มของแพลนถัดไป; ถ้าคำนวณได้ก่อนวันที่ซื้อ
// แปลว่าตอนซื้อแพลนหมดอายุไปแล้ว → เริ่มนับจากวันที่ซื้อแทน
(function fillMissingDates() {
  const users = db.prepare('SELECT DISTINCT user_id FROM plan_purchases WHERE starts_at IS NULL').all();
  const upd = db.prepare('UPDATE plan_purchases SET starts_at = ?, expires_at = ? WHERE id = ?');
  users.forEach(({ user_id }) => {
    const u = db.prepare('SELECT plan_expires_at FROM users WHERE id = ?').get(user_id);
    const rows = db.prepare('SELECT * FROM plan_purchases WHERE user_id = ? ORDER BY id DESC').all(user_id);
    let end = (u && u.plan_expires_at) || now();
    rows.forEach((r) => {
      let start = end - r.days * DAY;
      if (start < r.created_at) { start = r.created_at; end = start + r.days * DAY; }
      if (r.starts_at == null) upd.run(start, end, r.id);
      else { start = r.starts_at; }
      end = start;
    });
  });
})();

// วันหมดอายุจริง = ช่วงทดลองฟรีนับจากวันสมัคร หรือวันหมดอายุของแพลนที่ซื้อ แล้วแต่อันไหนนานกว่า
function expiresAt(u) {
  return Math.max((u.created_at || 0) + TRIAL_DAYS * DAY, u.plan_expires_at || 0);
}

function hasPurchase(userId) {
  return !!db.prepare('SELECT 1 FROM plan_purchases WHERE user_id = ? LIMIT 1').get(userId);
}

// kind: trial = ยังไม่เคยซื้อ (รวมบัญชีเก่าที่ได้ทดลองฟรีตอนเปิดระบบแพลน), paid = เคยซื้อแพลนแล้ว
function planStatus(u) {
  if (u.role === 'admin') return { kind: 'unlimited', active: true, expires_at: null, days_left: null };
  const exp = expiresAt(u);
  const active = exp > now();
  return {
    kind: hasPurchase(u.id) ? 'paid' : 'trial',
    active,
    expires_at: exp,
    days_left: active ? Math.ceil((exp - now()) / DAY) : 0,
  };
}

function isActive(u) { return planStatus(u).active; }

// รายละเอียดแพลนสำหรับแดชบอร์ด: สถานะ + ช่วงเวลาปัจจุบัน (ไว้ทำแถบความคืบหน้า) + ประวัติทั้งหมด (รวมช่วงทดลองฟรี)
function planDetails(u) {
  const status = planStatus(u);
  const rows = db.prepare('SELECT * FROM plan_purchases WHERE user_id = ? ORDER BY id').all(u.id);
  // ทดลองใช้ฟรีจบตอนแพลนแรกเริ่ม (ซื้อต่อก่อนหมด) — ถ้าซื้อหลังหมดอายุไปแล้ว ถือว่าจบที่ 21 วันหลังสมัคร
  const first = rows[0];
  const trialEnd = !first ? expiresAt(u)
    : first.starts_at > first.created_at ? first.starts_at
    : Math.min((u.created_at || 0) + TRIAL_DAYS * DAY, first.starts_at);
  const history = [
    { kind: 'trial', label: `ทดลองใช้ฟรี`, days: Math.round((trialEnd - (u.created_at || 0)) / DAY), price: 0,
      starts_at: u.created_at, expires_at: trialEnd, created_at: u.created_at },
    ...rows.map((r) => ({ kind: 'paid', label: r.label, days: r.days, price: r.price, starts_at: r.starts_at, expires_at: r.expires_at, created_at: r.created_at })),
  ];
  // ช่วงที่กำลังใช้อยู่ = แถวล่าสุดที่เริ่มแล้ว (ซื้อต่อล่วงหน้าหลายครั้ง แถวหลัง ๆ อาจยังไม่ถึงเวลาเริ่ม)
  const t = now();
  const current = [...history].reverse().find((h) => h.starts_at && h.starts_at <= t) || history[0];
  return { status, period_start: current.starts_at, period_label: current.label, trial_days: TRIAL_DAYS, history: history.reverse() };
}

// ซื้อ/ต่ออายุแพลน: หัก Token แล้วต่อเวลาจากวันหมดอายุเดิม (ยังไม่หมด = ต่อท้าย, หมดแล้ว = เริ่มนับจากวันนี้)
function purchase(userId, planId) {
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) { const e = new Error('ไม่พบแพลนนี้'); e.code = 'BAD_PLAN'; throw e; }
  return db.transaction(() => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const base = Math.max(expiresAt(u), now());
    const newExp = base + plan.days * DAY;
    const balance = ledger.debit(userId, 'token_balance', plan.price, 'plan_purchase', 'plan', null, `ซื้อแพลน ${plan.label}`);
    db.prepare('UPDATE users SET plan_expires_at = ? WHERE id = ?').run(newExp, userId);
    db.prepare(`INSERT INTO plan_purchases (user_id, plan_id, label, days, price, starts_at, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, plan.id, plan.label, plan.days, plan.price, base, newExp, now());
    return { balance, plan, status: planStatus({ ...u, plan_expires_at: newExp }) };
  })();
}

// ผู้โดเนทอัปเกรดเป็นสตรีมเมอร์: ช่วงทดลองฟรีเริ่มนับจากวันอัปเกรด (ไม่ใช่วันสมัคร) — เฉพาะคนที่ยังไม่เคยซื้อแพลน
// และเวลาที่เหลืออยู่น้อยกว่า 21 วัน (ไม่ลดเวลาของคนที่เหลือมากกว่านั้นอยู่แล้ว)
function startTrialOnUpgrade(u) {
  if (hasPurchase(u.id)) return;
  const trialEnd = now() + TRIAL_DAYS * DAY;
  if (expiresAt(u) < trialEnd) db.prepare('UPDATE users SET plan_expires_at = ? WHERE id = ?').run(trialEnd, u.id);
}

module.exports = { PLANS, TRIAL_DAYS, planStatus, planDetails, isActive, purchase, startTrialOnUpgrade };
