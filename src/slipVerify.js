const { EASYSLIP_API_KEY, SLIP2GO_API_KEY } = require('./config');

// ตรวจสลิปโอนเงินกับธนาคาร — ระบบอ่าน mini-QR ในสลิปแล้วดึงข้อมูลรายการจริงจากธนาคาร สลิปปลอม/ตัดต่อจะไม่ผ่าน
// รองรับ 2 เจ้า (ใส่ key เจ้าไหนก็ใช้เจ้านั้น มีทั้งคู่ = Slip2Go):
//   Slip2Go  https://slip2go.com/guide/rest-api/base64  (ตรวจสลิปธนาคาร + TrueMoney ใน endpoint เดียว)
//   EasySlip https://document.easyslip.com/en/v2/verify/bank/  (สลิป TrueMoney ตรวจต่อที่ /verify/truewallet)
const SLIP2GO_URL = 'https://connect.slip2go.com/api/verify-slip/qr-base64/info';
const EASYSLIP_BANK_URL = 'https://api.easyslip.com/v2/verify/bank';
const EASYSLIP_TRUEWALLET_URL = 'https://api.easyslip.com/v2/verify/truewallet';

function provider() {
  if (SLIP2GO_API_KEY) return 'slip2go';
  if (EASYSLIP_API_KEY) return 'easyslip';
  return null;
}

function enabled() {
  return !!provider();
}

async function postJson(url, key, body, label) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    return { res, body: await res.json().catch(() => ({})) };
  } catch (e) {
    console.warn(`[slip] เชื่อมต่อ ${label} ไม่สำเร็จ:`, e.message);
    return { res: null, body: {} };
  }
}

function callEasySlip(url, dataUrl) {
  return postJson(url, EASYSLIP_API_KEY, { base64: dataUrl }, 'EasySlip');
}

// ---------- Slip2Go ----------
// ไม่ส่ง checkCondition — ตรวจบัญชีผู้รับ/ยอด/เวลา/สลิปซ้ำเองใน evaluate() ให้เหมือนกันทุกเจ้า
async function verifySlip2Go(dataUrl) {
  const { res, body } = await postJson(SLIP2GO_URL, SLIP2GO_API_KEY, { payload: { imageBase64: dataUrl } }, 'Slip2Go');
  if (!res) return { kind: 'unavailable', reason: 'เชื่อมต่อระบบตรวจสลิปไม่สำเร็จ' };
  const code = String(body.code || '');
  const d = body.data;
  if ((code === '200000' || code === '200200') && d) {
    const acc = (d.receiver && d.receiver.account) || {};
    return {
      kind: 'ok',
      slip: {
        transRef: String(d.transRef || ''),
        amount: Number(d.amount),
        date: Date.parse(d.dateTime),
        receiver: {
          proxy: (acc.proxy && acc.proxy.account) || '',
          account: (acc.bank && acc.bank.account) || '',
          names: [acc.name].filter(Boolean),
        },
      },
    };
  }
  if (code === '200404') return { kind: 'notfound', reason: 'ระบบอ่าน QR ในสลิปไม่ได้ หรือไม่พบรายการโอนนี้ที่ธนาคาร' };
  if (code === '200500') return { kind: 'invalid', error: 'สลิปนี้ไม่ถูกต้องหรือถูกแก้ไข' };
  if (code === '200501') return { kind: 'invalid', error: 'สลิปนี้ถูกใช้ไปแล้ว' };
  if (code === '200502') return { kind: 'retry', error: 'ธนาคารตอบกลับผิดพลาด กรุณาอัปโหลดอีกครั้งในอีกสักครู่' };
  if (['400001', '400002', '400005'].includes(code)) {
    return { kind: 'invalid', error: 'อ่านรูปสลิปไม่ได้ กรุณาอัปโหลดรูปสลิปที่ชัด เห็น QR ครบ' };
  }
  // 401xxx (key ผิด/แพ็กเกจหมด/token หมด), 429000, 500xxx — ฝั่งเว็บต้องแก้ ไม่ใช่ความผิดของผู้ใช้
  console.warn('[slip] Slip2Go ตอบกลับผิดปกติ:', res.status, code, body.message || '');
  return { kind: 'unavailable', reason: `ระบบตรวจสลิปขัดข้อง (${code || res.status})` };
}

function bankSlip(raw) {
  const acc = (raw.receiver && raw.receiver.account) || {};
  return {
    transRef: String(raw.transRef || ''),
    amount: Number(raw.amount && raw.amount.amount),
    date: Date.parse(raw.date),
    receiver: {
      proxy: (acc.proxy && acc.proxy.account) || '',
      account: (acc.bank && acc.bank.account) || '',
      names: [acc.name && acc.name.th, acc.name && acc.name.en].filter(Boolean),
    },
  };
}

function trueWalletSlip(raw) {
  const r = raw.receiver || {};
  return {
    // คนละระบบกับเลขอ้างอิงธนาคาร — ใส่ prefix กันชนกันในคอลัมน์ trans_ref ที่ห้ามซ้ำ
    transRef: raw.transactionId ? 'TW:' + raw.transactionId : '',
    amount: Number(raw.amount),
    date: Date.parse(raw.date),
    receiver: { proxy: r.phone || '', account: '', names: [r.name].filter(Boolean) },
  };
}

// ผลลัพธ์ (kind):
//  ok          → { slip: { transRef, amount, date, receiver: { proxy, account, names } } }
//  invalid     → { error }  รูปใช้ไม่ได้ ให้ผู้ใช้อัปโหลดใหม่
//  retry       → { error }  ธนาคารยังไม่ยืนยันรายการ ให้ลองใหม่อีกสักครู่
//  notfound    → { reason } อ่าน QR ไม่ได้ / ไม่พบรายการทั้งที่ธนาคารและ TrueMoney
//  unavailable → { reason } ยังไม่ได้ตั้งค่า / ระบบตรวจขัดข้อง (ไม่รู้ผล)
async function verifyImage(dataUrl) {
  if (!enabled()) return { kind: 'unavailable', reason: 'ยังไม่ได้ตั้งค่าระบบตรวจสลิปอัตโนมัติ' };
  if (provider() === 'slip2go') return verifySlip2Go(dataUrl);
  return verifyEasySlip(dataUrl);
}

// ---------- EasySlip ----------
async function verifyEasySlip(dataUrl) {
  const bank = await callEasySlip(EASYSLIP_BANK_URL, dataUrl);
  if (!bank.res) return { kind: 'unavailable', reason: 'เชื่อมต่อระบบตรวจสลิปไม่สำเร็จ' };
  const raw = bank.res.ok && bank.body.success && bank.body.data && bank.body.data.rawSlip;
  if (raw) return { kind: 'ok', slip: bankSlip(raw) };

  const code = bank.body.error && bank.body.error.code;
  if (['INVALID_IMAGE_FORMAT', 'IMAGE_SIZE_TOO_LARGE', 'VALIDATION_ERROR'].includes(code)) {
    return { kind: 'invalid', error: 'อ่านรูปสลิปไม่ได้ กรุณาอัปโหลดรูปสลิปที่ชัด เห็น QR ครบ' };
  }
  if (code === 'SLIP_PENDING') {
    return { kind: 'retry', error: 'ธนาคารยังไม่ยืนยันรายการนี้ กรุณาอัปโหลดอีกครั้งในอีกสักครู่' };
  }
  if (code === 'SLIP_NOT_FOUND') {
    const tw = await callEasySlip(EASYSLIP_TRUEWALLET_URL, dataUrl);
    const twRaw = tw.res && tw.res.ok && tw.body.success && tw.body.data && tw.body.data.rawSlip;
    if (twRaw) return { kind: 'ok', slip: trueWalletSlip(twRaw) };
    const twCode = tw.body.error && tw.body.error.code;
    if (tw.res && ['SLIP_NOT_FOUND', 'INVALID_IMAGE', 'VALIDATION_ERROR'].includes(twCode)) {
      return { kind: 'notfound', reason: 'ระบบอ่าน QR ในสลิปไม่ได้ หรือไม่พบรายการโอนนี้ที่ธนาคาร' };
    }
    console.warn('[slip] EasySlip (TrueMoney) ตอบกลับผิดปกติ:', tw.res && tw.res.status, twCode || '');
    return { kind: 'unavailable', reason: `ระบบตรวจสลิปขัดข้อง (${twCode || 'truewallet'})` };
  }
  console.warn('[slip] EasySlip ตอบกลับผิดปกติ:', bank.res.status, code || '', (bank.body.error && bank.body.error.message) || '');
  return { kind: 'unavailable', reason: `ระบบตรวจสลิปขัดข้อง (${code || bank.res.status})` };
}

// เทียบเลขที่ถูกปิดบางส่วนในสลิป (เช่น "xxx-x-x5678-x", "08xxxxxxxx89") กับเลขเต็มของเรา
// → 'match' | 'mismatch' | 'unknown' (เลขที่เห็นน้อยเกินไปจะตัดสินไม่ได้)
function maskedCompare(masked, target) {
  const m = String(masked || '').toLowerCase().replace(/[^0-9x]/g, '');
  if ((m.match(/\d/g) || []).length < 2) return 'unknown';
  if (m.length === target.length) {
    for (let i = 0; i < m.length; i++) if (m[i] !== 'x' && m[i] !== target[i]) return 'mismatch';
    return 'match';
  }
  // ความยาวไม่เท่ากัน (เช่นเบอร์ในรูปแบบ 66/0066) — เทียบเฉพาะตัวเลขที่เห็นหัว/ท้าย
  const prefix = m.match(/^\d*/)[0];
  const suffix = m.match(/\d*$/)[0];
  if (!prefix && !suffix) return 'unknown';
  if ((prefix && !target.startsWith(prefix)) || (suffix && !target.endsWith(suffix))) return 'mismatch';
  return 'match';
}

function compareAny(masked, targets) {
  const results = targets.map((t) => maskedCompare(masked, t));
  if (results.includes('match')) return 'match';
  if (results.includes('mismatch')) return 'mismatch';
  return 'unknown';
}

// ชื่อบัญชีในสลิปมักถูกตัด เช่น "นาย อภิสิทธิ์ ธ" — เทียบชื่อต้นเต็มคำ + นามสกุลเท่าที่สลิปแสดง (ไม่สนคำนำหน้า/ช่องว่าง/ตัวพิมพ์)
const NAME_TITLES = /^(นาย|นางสาว|น\.ส\.|นาง|ด\.ช\.|ด\.ญ\.|mr|mrs|ms|miss)\.?$/i;
function nameParts(name) {
  return String(name || '').toLowerCase().replace(/[.,()]/g, ' ').split(/\s+/).filter((w) => w && !NAME_TITLES.test(w));
}
function nameMatch(slipName, expected) {
  const a = nameParts(slipName), b = nameParts(expected);
  if (!a.length || !b.length || a[0] !== b[0]) return false;
  // นามสกุล: ตัวที่สลิปแสดง (อาจถูกตัด) ต้องเป็นจุดเริ่มของนามสกุลจริง
  if (a[1] && b[1] && !b[1].startsWith(a[1])) return false;
  return true;
}

// ผู้รับในสลิปเป็นบัญชีปลายทางที่ต้องการไหม — forms = { proxy: [...], account: [...] } จาก promptpay.receiverForms()
function checkReceiver(receiver, forms) {
  const results = [];
  if (receiver.proxy && forms.proxy.length) results.push(compareAny(receiver.proxy, forms.proxy));
  if (receiver.account && forms.account.length) results.push(compareAny(receiver.account, forms.account));
  if (results.includes('match')) return 'match';
  if (results.includes('mismatch')) return 'mismatch';
  return 'unknown';
}

// เลขอ้างอิงธนาคารนี้เคยใช้แล้วหรือยัง (ค่าแพลน, โดเนทผ่าน QR สตรีมเมอร์, เติมเงินระบบเดิม) — 1 สลิปใช้ได้ครั้งเดียวทั้งเว็บ
function refUsed(transRef) {
  const { db } = require('./db');
  return ['plan_orders', 'donation_intents', 'topups']
    .some((t) => db.prepare(`SELECT 1 FROM ${t} WHERE trans_ref = ?`).get(transRef));
}

const CLOCK_SKEW = 10 * 60 * 1000;

// ตรวจสลิปของรายการหนึ่งครบทุกข้อ → ผลที่ผู้เรียกเอาไปตัดสินต่อ
//   ok      { transRef, paidAmount }  ผ่านทุกข้อ เครดิต/แจ้งเตือนได้ทันที
//   review  { reason, transRef }      ไม่แน่ใจ ให้คนตรวจเอง — เฉพาะ auto = false (เติมเงินที่แอดมินตรวจได้)
//   invalid { error }                 ใช้ไม่ได้ ให้ผู้ใช้แก้แล้วส่งใหม่ (รูปเสีย, โอนเข้าบัญชีอื่น, สลิปเคยใช้/เก่า ...)
//   retry   { error }                 ยังตัดสินไม่ได้ตอนนี้ ลองใหม่อีกสักครู่
//
// auto = true (โดเนทผ่าน QR): ไม่มีคนตรวจ ระบบตัดสินเองทุกกรณี
//   - ยอดไม่ตรง → ผ่าน แต่คืน paidAmount = ยอดจริงในสลิป ให้ผู้เรียกตัดสินว่ารับได้ไหม
//   - เลขบัญชีผู้รับในสลิปถูกปิดจนเทียบไม่ได้ → เทียบชื่อบัญชีกับ expectedName แทน
//   - ระบบตรวจขัดข้อง → ให้ลองใหม่ (ไม่ส่งไปรอคน)
async function evaluate(dataUrl, { amount, createdAt, forms, receiverLabel = 'บัญชีปลายทาง', auto = false, expectedName = '' }) {
  const v = await verifyImage(dataUrl);
  if (v.kind === 'invalid' || v.kind === 'retry') return v;
  if (v.kind === 'notfound') {
    return auto ? { kind: 'invalid', error: 'ไม่พบรายการโอนนี้ที่ธนาคาร — กรุณาอัปโหลดสลิปจริงจากแอปธนาคาร/TrueMoney ที่เห็น QR ชัด' }
      : { kind: 'review', reason: v.reason };
  }
  if (v.kind === 'unavailable') {
    return auto ? { kind: 'retry', error: 'ระบบตรวจสลิปขัดข้องชั่วคราว กรุณาลองอัปโหลดอีกครั้งในอีกสักครู่' }
      : { kind: 'review', reason: v.reason };
  }

  const s = v.slip;
  const transRef = s.transRef || null;
  if (!transRef) return auto ? { kind: 'invalid', error: 'อ่านเลขอ้างอิงธุรกรรมในสลิปไม่ได้' } : { kind: 'review', reason: 'ไม่พบเลขอ้างอิงธุรกรรมในสลิป' };
  if (refUsed(transRef)) return { kind: 'invalid', error: 'สลิปนี้ถูกใช้ไปแล้ว' };
  let receiver = checkReceiver(s.receiver, forms);
  if (receiver === 'unknown' && auto && expectedName && s.receiver.names.length) {
    receiver = s.receiver.names.some((n) => nameMatch(n, expectedName)) ? 'match' : 'mismatch';
  }
  if (receiver === 'mismatch') return { kind: 'invalid', error: `สลิปนี้ไม่ได้โอนเข้า${receiverLabel} กรุณาตรวจสอบอีกครั้ง` };
  if (!Number.isFinite(s.date) || s.date < createdAt - CLOCK_SKEW) {
    return auto ? { kind: 'invalid', error: 'สลิปนี้โอนก่อนสร้างรายการ — ใช้สลิปเก่าไม่ได้ กรุณาโอนตาม QR ของรายการนี้' }
      : { kind: 'review', reason: 'สลิปโอนก่อนสร้างรายการ', transRef };
  }
  if (receiver === 'unknown') {
    const desc = `${s.receiver.names[0] || '-'} ${s.receiver.proxy || s.receiver.account || ''}`.trim();
    return auto ? { kind: 'invalid', error: `ยืนยันบัญชีผู้รับจากสลิปไม่ได้ (${desc})` }
      : { kind: 'review', reason: `ระบบยืนยันบัญชีผู้รับจากสลิปไม่ได้ (${desc})`, transRef };
  }
  const paidAmount = Number(s.amount);
  if (!(paidAmount > 0)) return { kind: 'invalid', error: 'อ่านยอดเงินในสลิปไม่ได้' };
  if (!auto && Math.abs(paidAmount - amount) > 0.001) {
    return { kind: 'review', reason: `ยอดในสลิป ฿${paidAmount} ไม่ตรงกับรายการ ฿${amount}`, transRef };
  }
  return { kind: 'ok', transRef, paidAmount };
}

module.exports = { provider, enabled, verifyImage, evaluate, checkReceiver, maskedCompare, nameMatch, refUsed };
