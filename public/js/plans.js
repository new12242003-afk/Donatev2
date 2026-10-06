let ME;

const PLAN_ICONS = {
  trial: '<circle cx="12" cy="12" r="8"/>',
  '1m': '<path d="M12 3 5 18h14L12 3z"/><path d="M12 3v15"/>',
  '3m': '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  '6m': '<path d="M12 2 3 7l9 5 9-5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  '1y': '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M14.5 4.5c3-3 6.5-2 6.5-2s1 3.5-2 6.5L12 16l-4-4 6.5-7.5z"/><path d="M9 11 5 10l3-3h4M13 15l1 4 3-3v-4"/>',
};
const FEATURES = ['รับโดเนทและแจ้งเตือนบน OBS', 'ปรับแต่ง Overlay ได้ทั้งหมด', 'AI เสียงอ่านข้อความโดเนท', 'ถอนรายได้เข้าบัญชี'];
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
  const { plans, trial_days } = await api('/api/public/plans');
  render(plans, trial_days);
})();

function render(plans, trialDays) {
  const p = ME.plan;
  const status = document.getElementById('plStatus');
  let line;
  if (p.kind === 'unlimited') line = '<b>แอดมิน</b> — ใช้งานได้ไม่จำกัด';
  else if (!p.active) line = '<span class="pl-dot off"></span><b>หมดอายุแล้ว</b> — หน้าโดเนทปิดรับโดเนทอยู่';
  else line = `<span class="pl-dot"></span><b>${p.kind === 'trial' ? 'ทดลองใช้ฟรี' : 'แพลนใช้งานอยู่'}</b> — เหลือ ${p.days_left} วัน (ถึง ${fmtDate(p.expires_at)})`;
  status.innerHTML = `<div>${line}</div><div class="pl-bal">คงเหลือ <b>${tkAmount(ME.token_balance)}</b> <a href="/topup.html">เติมเงิน</a></div>`;

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
  if (p.kind === 'unlimited') grid.querySelectorAll('.pl-btn').forEach((b) => { b.disabled = true; });
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

async function buy(plan) {
  if (ME.token_balance < plan.price) {
    const go = await confirmDialog('Token ไม่พอ', `แพลน ${plan.label} ใช้ ${plan.price} Token แต่คุณมี ${fmt(ME.token_balance)} Token — ไปเติมเงินก่อนไหม?`, { confirmText: 'ไปเติมเงิน' });
    if (go) location.href = '/topup.html';
    return;
  }
  const ok = await confirmDialog(`ซื้อแพลน ${plan.label}?`, `หัก ${plan.price} Token จากกระเป๋า แล้วต่ออายุการใช้งาน ${plan.days} วัน`, { confirmText: `จ่าย ${plan.price} Token` });
  if (!ok) return;
  try {
    const r = await api('/api/me/plan', { method: 'POST', body: { plan: plan.id } });
    toast(`ซื้อแพลน ${plan.label} สำเร็จ ใช้ได้ถึง ${fmtDate(r.plan.expires_at)}`);
    setTimeout(() => location.reload(), 1200);
  } catch (e) { toast(e.message, false); }
}
