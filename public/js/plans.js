let ME, PLANS = [], TRIAL = 21, PAY_ENABLED = false;

const PLAN_ICONS = {
  trial: '<circle cx="12" cy="12" r="8"/>',
  '1m': '<path d="M12 3 5 18h14L12 3z"/><path d="M12 3v15"/>',
  '3m': '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  '6m': '<path d="M12 2 3 7l9 5 9-5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  '1y': '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M14.5 4.5c3-3 6.5-2 6.5-2s1 3.5-2 6.5L12 16l-4-4 6.5-7.5z"/><path d="M9 11 5 10l3-3h4M13 15l1 4 3-3v-4"/>',
};
const FEATURES = ['รับโดเนทและแจ้งเตือนบน OBS', 'ปรับแต่ง Overlay ได้ทั้งหมด', 'AI เสียงอ่านข้อความโดเนท', 'เงินโดเนทเข้าบัญชีพร้อมเพย์ของคุณโดยตรง'];
const DESC = {
  '1m': 'เริ่มต้นแบบสบายกระเป๋า', '3m': 'ประหยัดกว่ารายเดือน', '6m': 'ไลฟ์ต่อเนื่องไม่สะดุด', '1y': 'คุ้มที่สุด จ่ายครั้งเดียวทั้งปี',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PLAN_ICONS[name]}</svg>`;
}
const fmtDate = (ts) => new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

(async function () {
  ME = await getMe();
  if (!ME) { location.href = '/login.html'; return; }
  mountNav(ME);
  const [{ plans, trial_days }, cfg] = await Promise.all([api('/api/public/plans'), api('/api/public/config').catch(() => ({}))]);
  PLANS = plans;
  TRIAL = trial_days;
  PAY_ENABLED = !!cfg.plan_payment;
  render(plans, trial_days);
  initBuy();
  showPendingOrder();
})();

function render(plans, trialDays) {
  const p = ME.plan;
  const status = document.getElementById('plStatus');
  let line;
  if (p.kind === 'unlimited') line = '<b>แอดมิน</b> — ใช้งานได้ไม่จำกัด';
  else if (!p.active) line = '<span class="pl-dot off"></span><b>หมดอายุแล้ว</b> — หน้าโดเนทปิดรับโดเนทอยู่';
  else line = `<span class="pl-dot"></span><b>${p.kind === 'trial' ? 'ทดลองใช้ฟรี' : 'แพลนใช้งานอยู่'}</b> — เหลือ ${p.days_left} วัน (ถึง ${fmtDate(p.expires_at)})`;
  status.innerHTML = `<div>${line}</div>${PAY_ENABLED || p.kind === 'unlimited' ? '' : '<div class="pl-bal">ระบบชำระค่าแพลนยังไม่เปิด — ติดต่อผู้ดูแลเว็บเพื่อต่ออายุ</div>'}`;

  const grid = document.getElementById('plGrid');
  grid.innerHTML = '';

  // การ์ดทดลองฟรี
  const onTrial = p.kind === 'trial' && p.active;
  grid.append(card({
    key: 'trial', name: 'ทดลองฟรี', desc: 'ได้อัตโนมัติเมื่อสมัครสมาชิก',
    price: 0, per: `/ ${trialDays} วัน`,
    button: `<button class="pl-btn current" disabled>${onTrial ? 'แพลนปัจจุบัน' : 'ใช้สิทธิ์แล้ว'}</button>`,
    features: [`ใช้ได้ทุกฟีเจอร์ ${trialDays} วัน`, ...FEATURES.slice(0, 3)],
  }));

  plans.forEach((plan) => {
    const perMonth = plan.price / plan.months;
    const c = card({
      key: plan.id, name: plan.label, desc: DESC[plan.id] || '', recommended: plan.recommended,
      price: plan.price, per: `/ ${plan.label}`,
      note: plan.months > 1 ? `เฉลี่ย ฿${perMonth.toFixed(perMonth % 1 ? 1 : 0)} / เดือน` : '',
      button: `<button class="pl-btn${plan.recommended ? ' primary' : ''}">${p.kind === 'paid' && p.active ? 'ต่ออายุ +' + plan.label : 'ซื้อแพลนนี้'}</button>`,
      features: [`ใช้งานได้ ${plan.days} วัน`, ...FEATURES],
    });
    c.querySelector('.pl-btn').onclick = () => buy(plan);
    grid.append(c);
  });
  if (p.kind === 'unlimited' || ME.role !== 'streamer') grid.querySelectorAll('.pl-btn').forEach((b) => { b.disabled = true; });
}

function card({ key, name, desc, price, per, note, button, features, recommended }) {
  const c = el('div', { class: 'pl-card' + (recommended ? ' rec' : '') });
  c.innerHTML = `
    ${recommended ? '<span class="pl-rec">คุ้มสุด</span>' : ''}
    <div class="pl-ic">${icon(key)}</div>
    <div class="pl-name">${esc(name)}</div>
    <div class="pl-desc">${esc(desc)}</div>
    <div class="pl-price"><small>฿</small> ${fmt(price)} <span>${esc(per)}</span></div>
    <div class="pl-note">${esc(note || '')}</div>
    ${button}
    <div class="pl-sep"></div>
    <div class="pl-get">สิ่งที่คุณจะได้</div>
    <ul class="pl-feat">${features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`;
  return c;
}

// ---------- ซื้อแพลน: เลือกวิธีชำระ → QR พร้อมเพย์ของเว็บ (ใส่ราคาไว้แล้ว) → อัปโหลดสลิป → ต่ออายุทันที ----------
const BUY = { plan: null, busy: false, cur: null, timer: null };
const PENDING_KEY = 'plan-order';
const money = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function savePending(o) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(o)); } catch (_) {} }
function loadPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch (_) { return null; } }
function clearPending() { try { localStorage.removeItem(PENDING_KEY); } catch (_) {} }

function buy(plan) {
  if (!PAY_ENABLED) return toast('ระบบชำระค่าแพลนยังไม่เปิดให้บริการ กรุณาติดต่อผู้ดูแลเว็บ', false);
  BUY.plan = plan;
  document.getElementById('plSumTitle').textContent = 'แพลน ' + plan.label;
  document.getElementById('plSumPrice').textContent = money(plan.price);
  document.getElementById('plSumDays').textContent = plan.days + ' วัน';
  document.getElementById('plSumTotal').textContent = '฿' + money(plan.price);
  setBuyBusy(false);
  playUiSound('question');
  document.getElementById('plMethodModal').hidden = false;
}

function setBuyBusy(busy) {
  BUY.busy = busy;
  const b = document.getElementById('plMethodGo');
  b.disabled = busy;
  b.textContent = busy ? 'กำลังสร้าง QR…' : 'ทำการชำระเงิน';
}

async function createOrder() {
  if (!BUY.plan || BUY.busy) return;
  setBuyBusy(true);
  try {
    const r = await api('/api/plan-pay', { method: 'POST', body: { plan: BUY.plan.id } });
    document.getElementById('plMethodModal').hidden = true;
    openPayModal(r);
  } catch (e) {
    toast(e.message, false);
  } finally {
    setBuyBusy(false);
  }
}

function initBuy() {
  const modal = document.getElementById('plMethodModal');
  const close = () => { if (!BUY.busy) modal.hidden = true; };
  document.getElementById('plMethodClose').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
  document.getElementById('plMethodGo').onclick = createOrder;
  document.getElementById('plPayClose').onclick = closePayModal;
  document.getElementById('plPaySave').onclick = (e) => {
    e.preventDefault();
    const box = document.getElementById('plPayQr');
    const canvas = box.querySelector('canvas');
    const src = canvas ? canvas.toDataURL('image/png') : (box.querySelector('img') || {}).src;
    if (!src) return;
    const a = el('a', { href: src, download: `plan-${BUY.cur ? BUY.cur.reference : 'qr'}.png` });
    document.body.append(a);
    a.click();
    a.remove();
  };
  const input = document.getElementById('plSlipFile');
  input.onchange = () => { uploadSlip(input.files[0]); input.value = ''; };
}

function openPayModal(o) {
  BUY.cur = o;
  savePending(o);
  const total = '฿ ' + money(o.price);
  document.getElementById('plPayTotal').textContent = total;
  document.getElementById('plPayTotal2').textContent = total;
  document.getElementById('plPayItem').textContent = 'แพลน ' + o.plan_label;
  document.getElementById('plPayRef').textContent = o.reference;
  document.getElementById('plPayAcct').innerHTML = o.account_name
    ? `ชื่อบัญชีผู้รับ <b>${esc(o.account_name)}</b>${o.account_masked ? ` <span class="muted">(${esc(o.account_masked)})</span>` : ''}` : '';
  const qr = document.getElementById('plPayQr');
  qr.innerHTML = '';
  qr.classList.remove('expired');
  if (window.QRCode) new QRCode(qr, { text: o.qr, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
  else qr.textContent = o.qr;
  setSlipMsg('');
  setPayState('wait');
  document.getElementById('plPayModal').hidden = false;
  clearInterval(BUY.timer);
  BUY.timer = setInterval(pollOrder, 3000);
}

function closePayModal() {
  clearInterval(BUY.timer);
  BUY.cur = null;
  document.getElementById('plPayModal').hidden = true;
  showPendingOrder();
}

function setSlipMsg(text, err = false) {
  const m = document.getElementById('plSlipMsg');
  m.textContent = text;
  m.classList.toggle('err', err);
}

function setPayState(state, note) {
  const box = document.getElementById('plPayState');
  const o = BUY.cur;
  box.className = 'pp-qr-state ' + state;
  document.getElementById('plPaySlip').hidden = state === 'review' || state === 'rejected';
  document.getElementById('plPayExpire').innerHTML = o && state === 'wait'
    ? 'QR หมดอายุ <b>' + new Date(o.expires_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.</b>' : '';
  if (state === 'expired') {
    box.innerHTML = 'QR หมดอายุแล้ว — ถ้าโอนไปแล้ว ยังอัปโหลดสลิปได้ภายใน 24 ชั่วโมง';
    document.getElementById('plPayQr').classList.add('expired');
  } else if (state === 'review') {
    box.innerHTML = '<span class="pp-pulse"></span>ได้รับสลิปแล้ว — รอผู้ดูแลตรวจสอบ แพลนจะต่ออายุเมื่ออนุมัติ';
  } else if (state === 'rejected') {
    box.innerHTML = 'รายการนี้ไม่ผ่านการตรวจสอบ' + (note ? ': ' + esc(note) : '');
  } else {
    box.innerHTML = '<span class="pp-pulse"></span>รอการชำระเงิน…';
  }
}

async function pollOrder() {
  const o = BUY.cur;
  if (!o) return;
  let s;
  try { s = await api(`/api/plan-pay/${o.reference}/status`); } catch (_) { return; }
  if (BUY.cur !== o) return;
  if (s.status === 'paid') orderPaid(o);
  else if (s.status === 'rejected') { clearInterval(BUY.timer); clearPending(); setPayState('rejected', s.note); }
  else if (s.status === 'review') setPayState('review');
  else if (s.status === 'expired' && !s.accepts_slip) { clearInterval(BUY.timer); clearPending(); setPayState('rejected', 'หมดเวลาส่งสลิปแล้ว'); }
  else if (s.status === 'expired' && !document.getElementById('plPayState').classList.contains('expired')) setPayState('expired');
}

async function uploadSlip(file) {
  const o = BUY.cur;
  if (!file || !o) return;
  const btn = document.getElementById('plSlipBtn');
  btn.classList.add('busy');
  setSlipMsg('กำลังตรวจสลิปกับธนาคาร…');
  try {
    const slip = await slipToDataUrl(file);
    const r = await api(`/api/plan-pay/${o.reference}/slip`, { method: 'POST', body: { slip } });
    if (BUY.cur !== o) return;
    setSlipMsg('');
    if (r.status === 'paid') orderPaid(o);
    else setPayState('review');
  } catch (e) {
    if (BUY.cur === o) setSlipMsg(e.message, true);
  } finally {
    btn.classList.remove('busy');
  }
}

async function orderPaid(o) {
  clearInterval(BUY.timer);
  clearPending();
  BUY.cur = null;
  document.getElementById('plPayModal').hidden = true;
  ME = await getMe();
  render(PLANS, TRIAL);
  playUiSound('success');
  const until = ME.plan && ME.plan.expires_at ? ` ใช้ได้ถึง ${fmtDate(ME.plan.expires_at)}` : '';
  if (window.Swal) Swal.fire({ icon: 'success', title: 'ชำระค่าแพลนสำเร็จ! 🎉', text: `ต่ออายุแพลน ${o.plan_label} แล้ว${until}`, confirmButtonText: 'ตกลง' });
  else toast('ชำระค่าแพลนสำเร็จ');
}

// มีรายการค้าง (สร้าง QR แล้วยังไม่ส่งสลิป / รอแอดมินตรวจ) → แถบให้กลับไปทำต่อ
async function showPendingOrder() {
  const bar = document.getElementById('plPending');
  bar.hidden = true;
  const o = loadPending();
  if (!o || !o.reference) return;
  let s;
  try { s = await api(`/api/plan-pay/${o.reference}/status`); } catch (_) { clearPending(); return; }
  if (!['pending', 'expired', 'review'].includes(s.status) || (s.status !== 'review' && !s.accepts_slip)) { clearPending(); return; }
  bar.innerHTML = s.status === 'review'
    ? `⏳ การชำระแพลน ${esc(o.plan_label)} (฿${fmt(o.price)}) รอผู้ดูแลตรวจสลิป <button type="button" class="sm ghost" id="plPendingOpen">ดูสถานะ</button>`
    : `📎 คุณสร้าง QR ชำระแพลน ${esc(o.plan_label)} (฿${fmt(o.price)}) ไว้แต่ยังไม่ได้ส่งสลิป <button type="button" class="sm" id="plPendingOpen">ส่งสลิป</button> <button type="button" class="sm ghost" id="plPendingDrop">ยกเลิก</button>`;
  bar.hidden = false;
  document.getElementById('plPendingOpen').onclick = () => openPayModal(o);
  const drop = document.getElementById('plPendingDrop');
  if (drop) drop.onclick = () => { clearPending(); bar.hidden = true; };
}
