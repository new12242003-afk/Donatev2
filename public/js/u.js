// หน้าโดเนทสาธารณะ /u/:username — ผู้ชมกรอกยอด/ข้อความ → สแกน QR พร้อมเพย์ของสตรีมเมอร์ (ใส่ยอดไว้แล้ว)
// โอนตรงเข้าบัญชีสตรีมเมอร์ → อัปโหลดสลิป → ตรวจกับธนาคารแล้วขึ้นแจ้งเตือนบนไลฟ์ (ไม่ต้องล็อกอิน)
const PRESET_AMOUNTS = [10, 20, 50, 100, 500];
const ANON_NAME = 'ไม่ระบุชื่อ';
const ST = { me: null, profile: null, cfg: null, voiceClip: null, audioClip: null };
let recorder = null, recTimer = null;

(async function () {
  const username = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '').toLowerCase();
  const [me, data, stickers] = await Promise.all([
    getMe(),
    api('/api/public/u/' + encodeURIComponent(username)).catch(() => null),
    api('/api/public/stickers').catch(() => []),
  ]);
  ST.stickers = stickers;
  ST.me = me;
  mountNav(me);
  if (!data) { document.getElementById('dnNotFound').hidden = false; return; }
  ST.profile = data.profile;
  ST.cfg = data.config;
  // สตรีมเมอร์ปิดรับสติกเกอร์ → ไม่แสดงส่วนส่งสติกเกอร์เลย
  if (ST.cfg.stickers_enabled === false) ST.stickers = [];
  renderProfile();
  initForm();
  renderStickers();
  ST.accountName = data.account_name || '';
  initPayModal();
  initMethodModal();
  // แพลนของสตรีมเมอร์หมดอายุ / ยังไม่ตั้ง QR รับเงิน → ปิดฟอร์มโดเนท (เจ้าของหน้าเห็นลิงก์ไปแก้)
  const paused = ST.cfg.donations_enabled === false;
  if (data.accepting === false || !data.qr_ready || paused) {
    const closed = document.getElementById('dnClosed');
    if (paused) {
      closed.innerHTML = isSelf()
        ? '⏸️ คุณปิดรับโดเนทอยู่ — <a href="/dashboard.html#overlay">เปิดรับโดเนท</a>'
        : '⏸️ สตรีมเมอร์ปิดรับโดเนทชั่วคราว';
    } else if (data.accepting === false) {
      if (isSelf()) closed.innerHTML = '⏸️ แพลนของคุณหมดอายุ ผู้ชมจึงโดเนทไม่ได้ — <a href="/plans.html">ต่ออายุแพลน</a>';
    } else {
      closed.innerHTML = isSelf()
        ? '⏸️ คุณยังไม่ได้ตั้ง QR รับเงิน ผู้ชมจึงโดเนทไม่ได้ — <a href="/dashboard.html#settings">ตั้งค่า QR รับเงิน</a>'
        : '⏸️ สตรีมเมอร์รายนี้ยังไม่เปิดรับโดเนท';
    }
    closed.hidden = false;
    const form = document.getElementById('dnForm');
    form.inert = true;
    form.style.opacity = '.5';
  }
  document.getElementById('dnMain').hidden = false;
  checkPendingIntent();
  // นับยอดเข้าชมหน้าโดเนท (สถิติ "การวิเคราะห์" ของสตรีมเมอร์) — ไม่นับตอนเจ้าของเปิดดูหน้าตัวเอง
  if (!isSelf()) api('/api/public/streamer-view', { method: 'POST', body: { username: ST.profile.username } }).catch(() => {});
})();

function isSelf() { return !!(ST.me && ST.me.username === ST.profile.username); }

function renderProfile() {
  const p = ST.profile;
  document.title = `โดเนทให้ ${p.display_name} · Donate Stream`;
  const av = document.getElementById('dnAvatar');
  av.append(p.avatar_url
    ? el('img', { class: 'dn-avatar', src: p.avatar_url, alt: '' })
    : el('span', { class: 'dn-avatar dn-avatar-fallback' }, p.display_name.trim().charAt(0).toUpperCase()));
  document.getElementById('dnName').textContent = p.display_name;
  document.getElementById('dnBadge').hidden = !p.verified;
  document.getElementById('dnBio').textContent = p.bio;
  const social = socialLinksRow(p.social_links);
  if (social) document.getElementById('dnSocial').append(social);
  document.getElementById('dnAgreeName').textContent = p.display_name;
  document.getElementById('dnHideEmailName').textContent = p.display_name;
  document.getElementById('dnSelfNote').hidden = !isSelf();
}

// ---------- ฟอร์ม ----------
function initForm() {
  const { min_donation: min, max_donation: max } = ST.cfg;
  const amountInput = document.getElementById('dnAmount');
  amountInput.min = min; amountInput.max = max;
  document.getElementById('dnAmountHelp').textContent =
    `โดเนทได้ตั้งแต่ THB${fmt(min)} ถึง THB${fmt(max)} ต่อครั้ง · จ่ายด้วย QR พร้อมเพย์ เงินเข้าบัญชีสตรีมเมอร์โดยตรง`;

  // ปุ่มยอดสำเร็จรูป — แสดงเฉพาะยอดที่อยู่ในช่วงที่สตรีมเมอร์รับ ถ้าไม่มีเลยใช้ยอดขั้นต่ำแทน
  let presets = PRESET_AMOUNTS.filter((v) => v >= min && v <= max);
  if (!presets.length) presets = [min];
  const chips = document.getElementById('dnChips');
  presets.forEach((v) => {
    const b = el('button', { type: 'button', class: 'dn-chip' }, fmt(v));
    b.onclick = () => { amountInput.value = v; onAmountChange(); };
    chips.append(b);
  });
  amountInput.oninput = onAmountChange;

  const msg = document.getElementById('dnMsg');
  msg.oninput = () => { document.getElementById('dnMsgCount').textContent = msg.value.length; };

  const from = document.getElementById('dnFrom');
  const anon = document.getElementById('dnAnon');
  if (ST.me) from.value = ST.me.display_name || ST.me.username;
  anon.onchange = () => {
    from.disabled = anon.checked;
    if (anon.checked) { from.dataset.prev = from.value; from.value = ANON_NAME; }
    else from.value = from.dataset.prev || '';
    setErr('dnFromErr', '');
  };
  from.oninput = () => setErr('dnFromErr', '');
  ['dnAgree', 'dnAge'].forEach((id) => { document.getElementById(id).onchange = () => setErr('dnConsentErr', ''); });

  initVoice();
  initAudio();
  renderAccount();
  onAmountChange();
  document.getElementById('dnSubmit').onclick = submit;
  document.getElementById('dnForm').onsubmit = (e) => { e.preventDefault(); submit(); };
}

function amountValue() { return Math.floor(Number(document.getElementById('dnAmount').value)) || 0; }

function onAmountChange() {
  const a = amountValue();
  if (ST.selectedSticker && a > 0) selectSticker(null);
  document.querySelectorAll('.dn-chip').forEach((c) => c.classList.toggle('active', Number(c.textContent.replace(/,/g, '')) === a));
  setErr('dnAmountErr', '');
  updateMediaSections();
}

function setErr(id, text) {
  const e = document.getElementById(id);
  e.textContent = text;
  e.hidden = !text;
}

function renderAccount() {
  const box = document.getElementById('dnAccount');
  const btn = document.getElementById('dnSubmit');
  box.innerHTML = '';
  if (!ST.me) {
    // ไม่ต้องล็อกอินก็โดเนทได้ — ล็อกอินแล้วได้ประวัติการโดเนทในแดชบอร์ด
    box.append(
      el('span', {}, 'โดเนทได้เลยโดยไม่ต้องเข้าสู่ระบบ ·'),
      el('a', { href: '/login.html?next=' + encodeURIComponent(location.pathname) }, 'เข้าสู่ระบบ'),
      el('span', { class: 'muted' }, 'เพื่อเก็บประวัติการโดเนท'));
  } else {
    document.getElementById('dnHideEmailWrap').hidden = isSelf();
    box.append(el('span', {}, '@' + ST.me.username));
  }
  if (isSelf()) {
    btn.textContent = 'นี่คือหน้าโดเนทของคุณ';
    btn.disabled = true;
  } else if (ST.selectedSticker) {
    btn.textContent = `ส่งสติกเกอร์ ${ST.selectedSticker.name} ${ST.selectedSticker.emoji || ''} · ฿${fmt(ST.selectedSticker.cost)} →`;
  } else {
    btn.textContent = 'ส่งโดเนท →';
  }
}

// ---------- ข้อความเสียง / ไฟล์เพลง (แสดงเมื่อสตรีมเมอร์เปิดใช้) ----------
function updateMediaSections() {
  const c = ST.cfg, a = amountValue();
  // ส่งสติกเกอร์ = ไม่แนบเสียง/ไฟล์ (เหมือนข้อความ)
  const stickerMode = !!ST.selectedSticker;
  document.getElementById('dnVoiceSec').hidden = !c.voice_msg_enabled || stickerMode;
  document.getElementById('dnAudioSec').hidden = !c.audio_msg_enabled || stickerMode;
  if (stickerMode) { clearVoice(); clearAudio(); return; }

  if (c.voice_msg_enabled) {
    const ok = a >= c.voice_msg_min_amount;
    document.getElementById('dnVoiceBox').classList.toggle('locked', !ok);
    document.getElementById('dnMic').disabled = !ok;
    document.getElementById('dnVoiceTitle').textContent = ok
      ? `กดไมค์เพื่ออัดเสียง (ไม่เกิน ${c.voice_msg_max_sec} วินาที)`
      : `ขั้นต่ำ THB${fmt(c.voice_msg_min_amount)}`;
    if (!ok) clearVoice();
  }
  if (c.audio_msg_enabled) {
    const ok = a >= c.audio_msg_min_amount;
    document.getElementById('dnAudioBox').classList.toggle('locked', !ok);
    document.getElementById('dnAudioFile').disabled = !ok;
    document.getElementById('dnAudioTitle').textContent = ok
      ? `เลือกไฟล์ MP3/WAV/OGG (ไม่เกิน ${c.audio_msg_max_sec} วินาที, 8MB)`
      : `ขั้นต่ำ THB${fmt(c.audio_msg_min_amount)}`;
    if (!ok) clearAudio();
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    r.readAsDataURL(blob);
  });
}

function initVoice() {
  document.getElementById('dnMic').onclick = toggleRecording;
  document.getElementById('dnVoiceClear').onclick = clearVoice;
}

async function toggleRecording() {
  if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (_) { return toast('ไม่สามารถเข้าถึงไมโครโฟนได้ (ต้องอนุญาตสิทธิ์ใช้ไมค์)', false); }

  const maxSec = ST.cfg.voice_msg_max_sec || 5;
  const chunks = [];
  const mic = document.getElementById('dnMic');
  const status = document.getElementById('dnVoiceStatus');
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = async () => {
    clearInterval(recTimer);
    stream.getTracks().forEach((t) => t.stop());
    mic.classList.remove('rec');
    status.textContent = '';
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    ST.voiceClip = await blobToDataUrl(blob);
    const player = document.getElementById('dnVoicePlayer');
    player.src = URL.createObjectURL(blob);
    player.hidden = false;
    document.getElementById('dnVoiceClear').hidden = false;
  };
  recorder.start();
  mic.classList.add('rec');
  let sec = 0;
  status.textContent = `กำลังอัด… 0/${maxSec} วินาที (กดอีกครั้งเพื่อหยุด)`;
  recTimer = setInterval(() => {
    sec += 1;
    status.textContent = `กำลังอัด… ${sec}/${maxSec} วินาที (กดอีกครั้งเพื่อหยุด)`;
    if (sec >= maxSec) recorder.stop();
  }, 1000);
}

function clearVoice() {
  ST.voiceClip = null;
  const player = document.getElementById('dnVoicePlayer');
  player.hidden = true;
  player.removeAttribute('src');
  document.getElementById('dnVoiceClear').hidden = true;
}

function initAudio() {
  document.getElementById('dnAudioFile').onchange = (e) => {
    const file = e.target.files[0];
    setErr('dnAudioErr', '');
    ST.audioClip = null;
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { e.target.value = ''; return setErr('dnAudioErr', 'ไฟล์ใหญ่เกินไป (สูงสุด 8MB)'); }
    const url = URL.createObjectURL(file);
    const probe = new Audio(url);
    probe.onloadedmetadata = async () => {
      const maxSec = ST.cfg.audio_msg_max_sec || 15;
      if (probe.duration > maxSec) {
        e.target.value = '';
        URL.revokeObjectURL(url);
        return setErr('dnAudioErr', `ไฟล์ยาวเกินไป (ไม่เกิน ${maxSec} วินาที ไฟล์นี้ยาว ${Math.round(probe.duration)} วินาที)`);
      }
      ST.audioClip = await blobToDataUrl(file);
      const player = document.getElementById('dnAudioPlayer');
      player.src = url;
      player.hidden = false;
    };
    probe.onerror = () => { e.target.value = ''; setErr('dnAudioErr', 'ไฟล์เสียงไม่ถูกต้อง'); };
  };
}

function clearAudio() {
  ST.audioClip = null;
  const input = document.getElementById('dnAudioFile');
  input.value = '';
  const player = document.getElementById('dnAudioPlayer');
  player.hidden = true;
  player.removeAttribute('src');
}

// ---------- ส่งโดเนท ----------
// checkAmount = false สำหรับส่งสติกเกอร์ (ราคาคงที่ ไม่ใช้ช่องจำนวนเงิน)
function validate(checkAmount = true) {
  const { min_donation: min, max_donation: max } = ST.cfg;
  const a = amountValue();
  let ok = true;
  setErr('dnAmountErr', '');
  if (checkAmount && (!a || a < min || a > max)) { setErr('dnAmountErr', `จำนวนเงินต้องอยู่ระหว่าง THB${fmt(min)} - THB${fmt(max)}`); ok = false; }
  if (!document.getElementById('dnFrom').value.trim()) { setErr('dnFromErr', 'ห้ามว่างเปล่า'); ok = false; }
  if (!document.getElementById('dnAgree').checked || !document.getElementById('dnAge').checked) {
    setErr('dnConsentErr', 'ต้องทำเครื่องหมายถูกทั้งสองข้อ'); ok = false;
  }
  if (!ok) {
    const first = document.querySelector('.dn-err:not(:empty)');
    if (first) first.closest('.dn-sec').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  return ok;
}

function submit() {
  if (isSelf()) return;
  const sticker = ST.selectedSticker;
  if (!validate(!sticker)) return;
  const amount = sticker ? sticker.cost : amountValue();
  const display_name = document.getElementById('dnFrom').value.trim();
  const body = {
    streamer: ST.profile.username,
    display_name,
    hide_email: document.getElementById('dnHideEmail').checked,
  };
  if (sticker) body.sticker_code = sticker.code;
  else {
    body.amount = amount;
    body.message = document.getElementById('dnMsg').value;
    if (ST.voiceClip) body.voice_clip = ST.voiceClip;
    if (ST.audioClip) body.audio_clip = ST.audioClip;
  }
  openMethodModal({
    body, amount, from: display_name,
    item: sticker ? `สติกเกอร์ ${sticker.name} ${sticker.emoji || ''}`.trim() : `โดเนท ฿${fmt(amount)}`,
    sticker,
  });
}

// ---------- เลือกวิธีชำระเงิน (สรุปยอดก่อนสร้าง QR) ----------
const METHOD = { order: null, busy: false };

function money(n) {
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function initMethodModal() {
  const modal = document.getElementById('dnMethodModal');
  const close = () => { if (!METHOD.busy) modal.hidden = true; };
  document.getElementById('dnMethodClose').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
  document.getElementById('dnMethodGo').onclick = createDonation;
}

function openMethodModal(order) {
  METHOD.order = order;
  document.getElementById('dnMethodTo').textContent = ST.profile.display_name;
  document.getElementById('dnSumTitle').textContent = order.sticker ? order.item : `โดเนทให้ ${ST.profile.display_name}`;
  document.getElementById('dnSumLabel').textContent = order.sticker ? 'ราคาสติกเกอร์' : 'ยอดโดเนท';
  document.getElementById('dnSumPrice').textContent = money(order.amount);
  document.getElementById('dnSumFrom').textContent = order.from;
  document.getElementById('dnSumTotal').textContent = '฿' + money(order.amount);
  setMethodBusy(false);
  playUiSound('question');
  document.getElementById('dnMethodModal').hidden = false;
}

function setMethodBusy(busy) {
  METHOD.busy = busy;
  const b = document.getElementById('dnMethodGo');
  b.disabled = busy;
  b.textContent = busy ? 'กำลังสร้าง QR…' : 'ทำการชำระเงิน';
}

async function createDonation() {
  const o = METHOD.order;
  if (!o || METHOD.busy) return;
  setMethodBusy(true);
  try {
    const r = await api('/api/qr-donate', { method: 'POST', body: o.body });
    document.getElementById('dnMethodModal').hidden = true;
    openPayModal({ ...r, item: o.item, from: o.from });
  } catch (e) {
    toast(e.message, false);
  } finally {
    setMethodBusy(false);
  }
}

// ---------- หน้าสแกน QR + อัปโหลดสลิป ----------
// รายการล่าสุดเก็บไว้ในเบราว์เซอร์ (localStorage) — ปิดหน้าไปก่อนส่งสลิป กลับมาส่งต่อได้ภายใน 24 ชม.
const PAYX = { cur: null, timer: null };
const PENDING_TTL = 24 * 60 * 60 * 1000;

function pendingKey() { return 'dn-intent:' + ST.profile.username; }
function savePending(p) { try { localStorage.setItem(pendingKey(), JSON.stringify(p)); } catch (_) {} }
function loadPending() { try { return JSON.parse(localStorage.getItem(pendingKey()) || 'null'); } catch (_) { return null; } }
function clearPending() { try { localStorage.removeItem(pendingKey()); } catch (_) {} }

function initPayModal() {
  document.getElementById('dnPayClose').onclick = closePayModal;
  document.getElementById('dnPaySave').onclick = (e) => {
    e.preventDefault();
    const box = document.getElementById('dnPayQr');
    const canvas = box.querySelector('canvas');
    const src = canvas ? canvas.toDataURL('image/png') : (box.querySelector('img') || {}).src;
    if (!src) return;
    const a = el('a', { href: src, download: `donate-${PAYX.cur ? PAYX.cur.reference : 'qr'}.png` });
    document.body.append(a);
    a.click();
    a.remove();
  };
  const input = document.getElementById('dnSlipFile');
  input.onchange = () => { uploadDonationSlip(input.files[0]); input.value = ''; };
}

function openPayModal(p) {
  PAYX.cur = p;
  savePending(p);
  document.getElementById('dnPending').hidden = true;
  const money = '฿ ' + Number(p.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('dnPayTo').textContent = 'โดเนทให้ ' + ST.profile.display_name;
  document.getElementById('dnPayTotal').textContent = money;
  document.getElementById('dnPayTotal2').textContent = money;
  document.getElementById('dnPayItem').textContent = `${p.item || ''} · จาก ${p.from || ''}`;
  document.getElementById('dnPayRef').textContent = p.reference;
  const acct = p.account_name || ST.accountName;
  document.getElementById('dnPayAcct').innerHTML = acct
    ? `ชื่อบัญชีผู้รับ <b>${esc(acct)}</b>${p.account_masked ? ` <span class="muted">(${esc(p.account_masked)})</span>` : ''}` : '';
  const qr = document.getElementById('dnPayQr');
  qr.innerHTML = '';
  qr.classList.remove('expired');
  if (window.QRCode) new QRCode(qr, { text: p.qr, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
  else qr.textContent = p.qr;
  setSlipMsg('');
  setPayState('wait');
  document.getElementById('dnPayModal').hidden = false;
  clearInterval(PAYX.timer);
  PAYX.timer = setInterval(pollDonation, 3000);
}

function closePayModal() {
  clearInterval(PAYX.timer);
  document.getElementById('dnPayModal').hidden = true;
  PAYX.cur = null;
  checkPendingIntent();
}

function setSlipMsg(text, err = false) {
  const m = document.getElementById('dnSlipMsg');
  m.textContent = text;
  m.classList.toggle('err', err);
}

function setPayState(state, note) {
  const box = document.getElementById('dnPayState');
  const p = PAYX.cur;
  box.className = 'pp-qr-state ' + state;
  document.getElementById('dnPaySlip').hidden = state === 'review' || state === 'rejected';
  document.getElementById('dnPayExpire').innerHTML = p && state === 'wait'
    ? 'QR หมดอายุ <b>' + new Date(p.expires_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.</b>' : '';
  if (state === 'expired') {
    box.innerHTML = 'QR หมดอายุแล้ว — ถ้าโอนไปแล้ว ยังอัปโหลดสลิปได้ภายใน 24 ชั่วโมง';
    document.getElementById('dnPayQr').classList.add('expired');
  } else if (state === 'review') {
    box.innerHTML = '<span class="pp-pulse"></span>ได้รับสลิปแล้ว — รอสตรีมเมอร์ตรวจสอบยอดเงิน แจ้งเตือนจะขึ้นบนไลฟ์เมื่อยืนยัน';
  } else if (state === 'rejected') {
    box.innerHTML = 'โดเนทนี้ไม่ผ่านการตรวจสอบ' + (note ? ': ' + esc(note) : '');
  } else {
    box.innerHTML = '<span class="pp-pulse"></span>รอการโอนเงิน…';
  }
}

async function pollDonation() {
  const p = PAYX.cur;
  if (!p) return;
  let s;
  try { s = await api(`/api/qr-donate/${p.reference}?t=${encodeURIComponent(p.pay_token)}`); } catch (_) { return; }
  if (PAYX.cur !== p) return;
  if (s.status === 'completed') donationDone(p, s.amount);
  else if (s.status === 'rejected') { clearInterval(PAYX.timer); clearPending(); setPayState('rejected', s.note); }
  else if (s.status === 'review') setPayState('review');
  else if (s.status === 'expired' && !s.accepts_slip) { clearInterval(PAYX.timer); clearPending(); setPayState('rejected', 'หมดเวลาส่งสลิปแล้ว'); }
  else if (s.status === 'expired' && !document.getElementById('dnPayState').classList.contains('expired')) setPayState('expired');
}

async function uploadDonationSlip(file) {
  const p = PAYX.cur;
  if (!file || !p) return;
  const btn = document.getElementById('dnSlipBtn');
  btn.classList.add('busy');
  setSlipMsg('กำลังตรวจสลิปกับธนาคาร…');
  try {
    const slip = await slipToDataUrl(file);
    const r = await api(`/api/qr-donate/${p.reference}/slip`, { method: 'POST', body: { t: p.pay_token, slip } });
    if (PAYX.cur !== p) return;
    setSlipMsg('');
    if (r.status === 'completed') donationDone(p, r.amount);
    else setPayState('review');
  } catch (e) {
    if (PAYX.cur === p) setSlipMsg(e.message, true);
  } finally {
    btn.classList.remove('busy');
  }
}

function donationDone(p, paid) {
  clearInterval(PAYX.timer);
  clearPending();
  document.getElementById('dnPayModal').hidden = true;
  PAYX.cur = null;
  // ล้างฟอร์มสำหรับโดเนทครั้งถัดไป
  document.getElementById('dnMsg').value = '';
  document.getElementById('dnMsg').dataset.prev = '';
  document.getElementById('dnMsgCount').textContent = '0';
  clearVoice();
  clearAudio();
  if (ST.selectedSticker) selectSticker(null);
  playUiSound('success');
  // ยอดที่โอนจริงต่างจากที่กรอก → ระบบใช้ยอดจริง
  const item = paid && paid !== p.amount && !(p.item || '').startsWith('สติกเกอร์') ? `โดเนท ฿${fmt(paid)}` : p.item;
  const text = `ส่ง ${item || ''} ให้ ${ST.profile.display_name} แล้ว — แจ้งเตือนขึ้นบนไลฟ์เรียบร้อย`;
  if (window.Swal) Swal.fire({ icon: 'success', title: 'โดเนทสำเร็จ! 🎉', text, confirmButtonText: 'ตกลง' });
  else toast('โดเนทสำเร็จ!');
}

// มีรายการค้าง (สร้าง QR แล้วยังไม่ได้ส่งสลิป) → แถบแจ้งให้กลับไปส่งสลิปต่อ
async function checkPendingIntent() {
  const bar = document.getElementById('dnPending');
  bar.hidden = true;
  const p = loadPending();
  if (!p || !p.reference || Date.now() - (p.expires_at - 15 * 60 * 1000) > PENDING_TTL) { clearPending(); return; }
  let s;
  try { s = await api(`/api/qr-donate/${p.reference}?t=${encodeURIComponent(p.pay_token)}`); } catch (_) { clearPending(); return; }
  if (!['pending', 'expired', 'review'].includes(s.status) || (s.status !== 'review' && !s.accepts_slip)) { clearPending(); return; }
  bar.innerHTML = s.status === 'review'
    ? `⏳ โดเนท ฿${fmt(p.amount)} ของคุณรอสตรีมเมอร์ตรวจสลิป <button type="button" class="sm ghost" id="dnPendingOpen">ดูสถานะ</button>`
    : `📎 คุณสร้าง QR โดเนท ฿${fmt(p.amount)} ไว้แต่ยังไม่ได้ส่งสลิป <button type="button" class="sm" id="dnPendingOpen">ส่งสลิป</button> <button type="button" class="sm ghost" id="dnPendingDrop">ยกเลิก</button>`;
  bar.hidden = false;
  document.getElementById('dnPendingOpen').onclick = () => openPayModal(p);
  const drop = document.getElementById('dnPendingDrop');
  if (drop) drop.onclick = () => { clearPending(); bar.hidden = true; };
}

// ---------- ส่งสติกเกอร์ (ราคาคงที่, แนบข้อความไม่ได้) ----------
function renderStickers() {
  const list = ST.stickers || [];
  const box = document.getElementById('dnStickers');
  document.getElementById('dnStickerSec').hidden = !list.length;
  box.innerHTML = '';
  list.forEach((st) => {
    const b = el('button', { type: 'button', class: 'dn-sticker', title: st.name, 'aria-pressed': 'false' });
    b.dataset.code = st.code;
    b.append(
      st.image_url ? el('img', { class: 'dn-sticker-art', src: st.image_url, alt: '' }) : el('span', { class: 'dn-sticker-art' }, st.emoji || '⭐'),
      el('span', { class: 'dn-sticker-name' }, st.name),
      el('span', { class: 'dn-sticker-cost' }, '฿' + fmt(st.cost)));
    b.onclick = () => selectSticker(ST.selectedSticker && ST.selectedSticker.code === st.code ? null : st);
    box.append(b);
  });
}

// เลือกสติกเกอร์ = โหมดส่งสติกเกอร์: ปิดช่องข้อความ ล้างจำนวนเงิน ซ่อนส่วนเสียง / null = กลับเป็นโดเนทเงิน
function selectSticker(st) {
  ST.selectedSticker = st;
  document.querySelectorAll('.dn-sticker').forEach((b) => {
    const on = !!st && b.dataset.code === st.code;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const msg = document.getElementById('dnMsg');
  if (st) {
    if (!msg.disabled) msg.dataset.prev = msg.value;
    msg.value = '';
    msg.disabled = true;
    msg.placeholder = 'ส่งสติกเกอร์แนบข้อความไม่ได้';
    const amt = document.getElementById('dnAmount');
    amt.value = '';
    document.querySelectorAll('.dn-chip').forEach((c) => c.classList.remove('active'));
    setErr('dnAmountErr', '');
  } else if (msg.disabled) {
    msg.disabled = false;
    msg.value = msg.dataset.prev || '';
    msg.placeholder = '';
  }
  document.getElementById('dnMsgCount').textContent = msg.value.length;
  document.getElementById('dnMsgNote').hidden = !st;
  updateMediaSections();
  renderAccount();
}
