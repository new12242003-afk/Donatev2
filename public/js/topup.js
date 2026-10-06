let ME;
const PAY = { amount: 0, method: 'promptpay', busy: false };

(async function () {
  ME = await getMe();
  if (!ME) { location.href = '/login.html'; return; }
  mountNav(ME);

  document.getElementById('bal').innerHTML = tkAmount(ME.token_balance);
  if (!ME.email_verified) document.getElementById('verifyWarn').style.display = '';

  const cfg = await api('/api/public/config');
  // ยังไม่เปิดระบบชำระเงิน (บนเว็บจริงปิดเติมเงินจำลองไว้)
  if (cfg.payments_enabled === false) {
    const note = el('div', { class: 'card tp-closed' }, '⏸️ ระบบเติมเงินออนไลน์ยังไม่เปิดให้บริการ — หากต้องการเติม Token กรุณาติดต่อผู้ดูแลเว็บ');
    document.querySelector('.tp-balance').after(note);
  }
  renderPackages(cfg.topup_packages);
  initPayModal();
  initPromptPay();
})();

// ---------- การ์ดแพ็กเกจ ----------
// จำนวนเพชรในกองโตขึ้นตามลำดับแพ็กเกจ (แพ็กแรก = กองเล็กสุด)
const PILE_SIZES = [3, 5, 7, 10, 13, 16];

function gemPileSvg(tier) {
  const n = PILE_SIZES[Math.min(tier, PILE_SIZES.length - 1)];
  // วางเป็นแถวจากล่างขึ้นบน แถวล่างกว้างสุด — วาดแถวบน (ด้านหลัง) ก่อนให้แถวล่างทับด้านหน้า
  const caps = [5, 4, 4, 3];
  const rows = [];
  let left = n;
  for (const cap of caps) { if (left <= 0) break; rows.push(Math.min(cap, left)); left -= cap; }
  const parts = [];
  rows.slice().reverse().forEach((count, ri) => {
    const row = rows.length - 1 - ri;            // 0 = แถวล่าง
    const size = 38 - row * 3;
    const y = 96 - size - row * 17;
    const span = (count - 1) * (size * 0.72);
    for (let i = 0; i < count; i++) {
      const x = 80 - span / 2 + i * size * 0.72 - size / 2 + ((i + row) % 2 ? 2 : -2);
      const rot = ((i * 37 + row * 23) % 30) - 15;
      parts.push(`<use href="#gem" x="${x.toFixed(1)}" y="${(y + (i % 2) * 3).toFixed(1)}" width="${size}" height="${size}" transform="rotate(${rot} ${(x + size / 2).toFixed(1)} ${(y + size / 2).toFixed(1)})"/>`);
    }
  });
  const sparkles = [[30, 22, 7], [128, 30, 6], [112, 10, 4], [44, 48, 4], [140, 62, 4]]
    .map(([x, y, r]) => `<path d="M${x} ${y - r}L${x + r * .28} ${y - r * .28}L${x + r} ${y}L${x + r * .28} ${y + r * .28}L${x} ${y + r}L${x - r * .28} ${y + r * .28}L${x - r} ${y}L${x - r * .28} ${y - r * .28}Z" fill="#fff"/>`)
    .join('');
  return `<svg class="tp-pile" viewBox="0 0 160 104" aria-hidden="true">
    <ellipse cx="80" cy="96" rx="${40 + n * 2}" ry="6" fill="#0b1640" opacity=".35"/>${parts.join('')}${sparkles}</svg>`;
}

function renderPackages(pkgs) {
  const box = document.getElementById('pkgs');
  box.innerHTML = '';
  pkgs.forEach((amount, i) => {
    const card = el('button', { type: 'button', class: 'tp-card', html: `
      <span class="tp-ribbon">คุ้มค่า</span>
      <span class="tp-art">${gemPileSvg(i)}</span>
      <span class="tp-name">เติม <b>${fmt(amount)}</b>${tokenIcon()}</span>
      <span class="tp-qty"><svg class="tp-gem-sm" viewBox="0 0 40 40"><use href="#gem"/></svg><span class="tp-x">×</span>${fmt(amount)}</span>
      <span class="tp-price"><span class="tp-baht">฿</span>${amountText(amount)}</span>` });
    card.onclick = () => {
      box.querySelectorAll('.tp-card').forEach((c) => c.classList.toggle('selected', c === card));
      openPay(amount);
    };
    box.append(card);
  });
}

function amountText(n) {
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- หน้าชำระเงิน ----------
function initPayModal() {
  const modal = document.getElementById('payModal');
  document.getElementById('payClose').onclick = closePay;
  modal.onclick = (e) => { if (e.target === modal) closePay(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closePay(); });
  document.querySelectorAll('#payMethods .tp-method').forEach((b) => {
    b.onclick = () => { if (!b.disabled) selectMethod(b.dataset.method); };
  });
  document.getElementById('payGo').onclick = submitPay;
}

function openPay(amount) {
  Object.assign(PAY, { amount, busy: false });
  document.getElementById('sumTitle').innerHTML = tkAmount(amount);
  document.getElementById('sumPrice').textContent = amountText(amount);
  document.getElementById('sumTotal').textContent = '฿' + amountText(amount);
  selectMethod(PAY.method);
  document.getElementById('payModal').hidden = false;
}

function closePay() {
  document.getElementById('payModal').hidden = true;
  document.querySelectorAll('.tp-card.selected').forEach((c) => c.classList.remove('selected'));
}

function selectMethod(method) {
  PAY.method = method;
  document.querySelectorAll('#payMethods .tp-method').forEach((b) =>
    b.classList.toggle('active', b.dataset.method === method));
  const detail = document.getElementById('payDetail');
  if (method === 'promptpay') {
    detail.innerHTML = `<div class="tp-detail-note">กด <b>ทำการชำระเงิน</b> เพื่อสร้าง QR PromptPay แล้วสแกนจ่ายผ่านแอปธนาคาร
      — ระบบยืนยันการชำระเงินให้อัตโนมัติ <span class="muted">(โหมดจำลอง)</span></div>`;
  } else {
    detail.innerHTML = `<div class="tp-detail-note">เติม Token เข้าบัญชีทันทีเพื่อทดสอบระบบ
      <span class="muted">— โหมดจำลอง ไม่มีการตัดเงินจริง</span></div>`;
  }
  setPayButton('ทำการชำระเงิน');
}

function setPayButton(label, busy = false) {
  const b = document.getElementById('payGo');
  b.textContent = label;
  b.disabled = busy;
}

// ถามยืนยันอีกขั้นก่อนสร้างรายการชำระเงิน (แสดงแพ็กเกจ วิธีชำระ และยอดที่ต้องจ่าย)
const PAY_METHOD_LABEL = { promptpay: 'PromptPay (สแกน QR)', mock: 'ชำระทันที (จำลอง)' };
async function confirmTopup() {
  const label = PAY_METHOD_LABEL[PAY.method] || PAY.method;
  if (!window.Swal) return confirm(`ยืนยันการชำระเงิน ฿${amountText(PAY.amount)} ด้วย ${label}?`);
  playUiSound('question');
  const r = await Swal.fire({
    icon: 'question',
    title: 'ยืนยันการชำระเงิน?',
    html: `เติม <b>${tkAmount(PAY.amount)}</b> ด้วย ${esc(label)}<br>ยอดที่ต้องชำระ <b>฿${amountText(PAY.amount)}</b>`,
    showCancelButton: true,
    confirmButtonText: `ชำระ ฿${amountText(PAY.amount)}`,
    cancelButtonText: 'ยกเลิก',
    reverseButtons: true,
  });
  return r.isConfirmed;
}

async function submitPay() {
  if (PAY.busy) return;
  if (!ME.email_verified) return toast('กรุณายืนยันอีเมลก่อนเติมเงิน', false);
  PAY.busy = true;
  if (!(await confirmTopup())) { PAY.busy = false; return; }
  setPayButton('กำลังดำเนินการ…', true);
  try {
    const r = await api('/api/topup', { method: 'POST', body: { amount_baht: PAY.amount, method: PAY.method } });
    if (r.status === 'paid') { closePay(); return paySuccess(r.tokens); }
    openPromptPay(r);
  } catch (e) {
    toast(e.message, false);
  } finally {
    PAY.busy = false;
    setPayButton('ทำการชำระเงิน');
  }
}

// ---------- หน้า QR PromptPay: เช็คสถานะทุก 2 วินาทีจนจ่ายสำเร็จ/หมดอายุ/ผู้ใช้กดกลับ ----------
const PP = { ref: null, timer: null };

function fmtExpire(ts) {
  const d = new Date(ts), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}, ${p(d.getHours())} : ${p(d.getMinutes())} : ${p(d.getSeconds())}`;
}

function openPromptPay(r) {
  closePay();
  PP.ref = r.reference;
  const money = '฿ ' + amountText(PAY.amount);
  document.getElementById('ppTotalLeft').textContent = money;
  document.getElementById('ppTotalRight').textContent = money;
  document.getElementById('ppItem').innerHTML = 'เติม ' + tkAmount(PAY.amount);
  document.getElementById('ppRef').textContent = r.reference;
  document.getElementById('ppExpire').innerHTML = 'รหัสการชำระเงินจะหมดอายุใน <b>' + fmtExpire(r.expires_at) + '</b>';

  // QR = ลิงก์หน้าจ่ายเงินจำลอง (ใช้ origin ที่เปิดหน้านี้อยู่ — เปิดผ่าน IP ในวง LAN มือถือจึงสแกนแล้วเข้าได้)
  const payUrl = location.origin + r.payment.pay_path;
  document.getElementById('ppDevLink').href = payUrl;
  const qr = document.getElementById('ppQr');
  qr.innerHTML = '';
  qr.classList.remove('expired');
  if (window.QRCode) new QRCode(qr, { text: payUrl, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
  else qr.textContent = payUrl;
  setPpState('wait');

  document.getElementById('ppModal').hidden = false;
  clearInterval(PP.timer);
  PP.timer = setInterval(pollPromptPay, 2000);
}

function setPpState(state) {
  const el = document.getElementById('ppState');
  el.className = 'pp-qr-state ' + state;
  el.innerHTML = state === 'expired'
    ? 'รหัส QR หมดอายุแล้ว — <a href="#" id="ppRetry">สร้าง QR ใหม่</a>'
    : '<span class="pp-pulse"></span>รอการชำระเงิน…';
  if (state === 'expired') {
    document.getElementById('ppQr').classList.add('expired');
    document.getElementById('ppRetry').onclick = (e) => { e.preventDefault(); closePromptPay(); openPay(PAY.amount); };
  }
}

async function pollPromptPay() {
  if (!PP.ref) return;
  let s;
  try { s = await api('/api/topup/' + PP.ref + '/status'); } catch (_) { return; }
  if (s.status === 'paid') { closePromptPay(); paySuccess(s.tokens); }
  else if (s.status === 'expired') { clearInterval(PP.timer); setPpState('expired'); }
}

function closePromptPay() {
  clearInterval(PP.timer);
  PP.ref = null;
  document.getElementById('ppModal').hidden = true;
}

function initPromptPay() {
  document.getElementById('ppBack').onclick = () => { closePromptPay(); openPay(PAY.amount); };
  const closePaid = () => { document.getElementById('paidModal').hidden = true; };
  document.getElementById('paidX').onclick = closePaid;
  document.getElementById('paidOk').onclick = closePaid;
}

async function paySuccess(tokens) {
  document.querySelectorAll('.tp-card.selected').forEach((c) => c.classList.remove('selected'));
  await refreshBalance();
  playUiSound('success');
  document.getElementById('paidText').innerHTML = 'เรายืนยันการชำระเงินของคุณแล้ว ได้รับ +' + tkAmount(tokens) + ' เข้าบัญชีเรียบร้อย';
  document.getElementById('paidModal').hidden = false;
}

async function refreshBalance() {
  ME = await getMe();
  document.getElementById('bal').innerHTML = tkAmount(ME.token_balance);
  // อัปเดตยอดในแถบเมนูด้านบนด้วย
  updateNavBalance(ME.token_balance);
}
