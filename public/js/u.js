// หน้าโดเนทสาธารณะ /u/:username — ผู้ชมเปิดลิงก์ของสตรีมเมอร์แล้วโดเนทด้วย Token ในบัญชีตัวเอง
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
  renderProfile();
  initForm();
  renderStickers();
  // แพลนของสตรีมเมอร์หมดอายุ → ปิดฟอร์มโดเนท (เจ้าของหน้าเห็นลิงก์ไปต่ออายุ)
  if (data.accepting === false) {
    const closed = document.getElementById('dnClosed');
    if (isSelf()) closed.innerHTML = '⏸️ แพลนของคุณหมดอายุ ผู้ชมจึงโดเนทไม่ได้ — <a href="/plans.html">ต่ออายุแพลน</a>';
    closed.hidden = false;
    const form = document.getElementById('dnForm');
    form.inert = true;
    form.style.opacity = '.5';
  }
  document.getElementById('dnMain').hidden = false;
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
    `โดเนทได้ตั้งแต่ THB${fmt(min)} ถึง THB${fmt(max)} ต่อครั้ง · ใช้ Token จากบัญชีของคุณ (1 Token = 1 บาท)`;

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
    box.append(el('span', {}, 'เข้าสู่ระบบก่อน เพื่อโดเนทด้วย Token ในบัญชีของคุณ'));
    btn.textContent = 'เข้าสู่ระบบเพื่อโดเนท →';
    return;
  }
  document.getElementById('dnHideEmailWrap').hidden = isSelf();
  box.append(
    el('span', {}, '@' + ST.me.username),
    el('span', { class: 'dn-bal', html: 'ยอด ' + tkAmount(ST.me.token_balance) }),
    el('a', { href: '/topup.html' }, 'เติมเงิน'));
  if (isSelf()) {
    btn.textContent = 'นี่คือหน้าโดเนทของคุณ';
    btn.disabled = true;
  } else if (ST.selectedSticker) {
    btn.textContent = `ส่งสติกเกอร์ ${ST.selectedSticker.name} ${ST.selectedSticker.emoji || ''} →`;
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

async function submit() {
  if (!ST.me) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname);
    return;
  }
  if (ST.selectedSticker) return sendSticker(ST.selectedSticker);
  if (isSelf() || !validate()) return;
  if (!ST.me.email_verified) return toast('กรุณายืนยันอีเมลก่อนโดเนท', false);

  const amount = amountValue();
  const body = {
    streamer: ST.profile.username,
    amount,
    display_name: document.getElementById('dnFrom').value.trim(),
    message: document.getElementById('dnMsg').value,
    hide_email: document.getElementById('dnHideEmail').checked,
  };
  if (ST.voiceClip) body.voice_clip = ST.voiceClip;
  if (ST.audioClip) body.audio_clip = ST.audioClip;

  const btn = document.getElementById('dnSubmit');
  if (btn.disabled) return;
  if (!(await confirmDonation(amount, body.display_name))) return;
  btn.disabled = true;
  btn.textContent = 'กำลังส่ง…';
  try {
    const r = await api('/api/donate', { method: 'POST', body });
    ST.me.token_balance = r.balance;
    document.getElementById('dnMsg').value = '';
    document.getElementById('dnMsgCount').textContent = '0';
    clearVoice();
    clearAudio();
    updateNavBalance(ST.me.token_balance);
    playUiSound('success');
    if (window.Swal) {
      Swal.fire({ icon: 'success', title: 'โดเนทสำเร็จ! 🎉', text: `ส่ง ${fmt(amount)} บาท ให้ ${ST.profile.display_name} แล้ว`, confirmButtonText: 'ตกลง' });
    } else toast('โดเนทสำเร็จ!');
  } catch (e) {
    // Token ไม่พอ → พาไปหน้าเติมเงิน
    if (/Token ไม่พอ/.test(e.message) && window.Swal) {
      playUiSound('error');
      const go = await Swal.fire({
        icon: 'warning', title: 'ยอด Token ไม่พอ', text: e.message,
        showCancelButton: true, confirmButtonText: 'ไปเติมเงิน', cancelButtonText: 'ปิด', reverseButtons: true,
      });
      if (go.isConfirmed) location.href = '/topup.html';
    } else toast(e.message, false);
  } finally {
    btn.disabled = false;
    renderAccount();
  }
}

// ถามยืนยันอีกครั้งก่อนตัด Token — สรุปยอด ผู้รับ และยอดคงเหลือหลังโดเนท
async function confirmDonation(amount, fromName) {
  const bal = Number(ST.me.token_balance) || 0;
  if (!window.Swal) return confirm(`ยืนยันโดเนท ${fmt(amount)} บาท ให้ ${ST.profile.display_name}?`);
  playUiSound('question');
  const after = bal - amount;
  const r = await Swal.fire({
    title: 'ยืนยันการโดเนท?',
    html: `<div class="dn-confirm">
        <div class="dn-confirm-amt">${tkAmount(amount)}</div>
        <div>ให้ <b>${esc(ST.profile.display_name)}</b></div>
        <div class="dn-confirm-rows">
          <div><span>ชื่อที่แสดง</span><b>${esc(fromName)}</b></div>
          <div><span>Token คงเหลือ</span><b>${fmt(bal)} → <span class="${after < 0 ? 'neg' : ''}">${fmt(after)}</span>${tokenIcon()}</b></div>
        </div>
        ${after < 0 ? '<div class="dn-confirm-warn">ยอด Token ไม่พอ กรุณาเติมเงินก่อน</div>' : ''}
      </div>`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: after < 0 ? 'ไปเติมเงิน' : 'ยืนยัน ส่งโดเนท',
    cancelButtonText: 'ยกเลิก',
    reverseButtons: true,
    focusConfirm: true,
  });
  if (r.isConfirmed && after < 0) { location.href = '/topup.html'; return false; }
  return r.isConfirmed;
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
      el('span', { class: 'dn-sticker-cost', html: tkAmount(st.cost) }));
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

async function sendSticker(st) {
  if (!ST.me) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); return; }
  if (isSelf()) return toast('โดเนทให้ตัวเองไม่ได้', false);
  if (!validate(false)) return;
  if (!ST.me.email_verified) return toast('กรุณายืนยันอีเมลก่อนโดเนท', false);

  const from = document.getElementById('dnFrom').value.trim();
  const bal = Number(ST.me.token_balance) || 0;
  const after = bal - st.cost;
  if (!window.Swal) {
    if (!confirm(`ส่ง${st.name} (${st.cost} Token) ให้ ${ST.profile.display_name}?`)) return;
  } else {
  playUiSound('question');
  const art = st.image_url ? `<img src="${esc(st.image_url)}" alt="" style="width:84px">` : esc(st.emoji || '⭐');
  const r = await Swal.fire({
    title: 'ยืนยันการส่งสติกเกอร์?',
    html: `<div class="dn-confirm">
        <div class="dn-confirm-sticker">${art}</div>
        <div>ส่ง <b>${esc(st.name)}</b> ให้ <b>${esc(ST.profile.display_name)}</b></div>
        <div class="dn-confirm-rows">
          <div><span>ราคา</span><b>${tkAmount(st.cost)}</b></div>
          <div><span>ชื่อที่แสดง</span><b>${esc(from)}</b></div>
          <div><span>Token คงเหลือ</span><b>${fmt(bal)} → <span class="${after < 0 ? 'neg' : ''}">${fmt(after)}</span>${tokenIcon()}</b></div>
        </div>
        ${after < 0 ? '<div class="dn-confirm-warn">ยอด Token ไม่พอ กรุณาเติมเงินก่อน</div>' : ''}
      </div>`,
    showCancelButton: true,
    confirmButtonText: after < 0 ? 'ไปเติมเงิน' : 'ยืนยัน ส่งสติกเกอร์',
    cancelButtonText: 'ยกเลิก',
    reverseButtons: true,
  });
  if (!r.isConfirmed) return;
  if (after < 0) { location.href = '/topup.html'; return; }
  }

  const btn = document.getElementById('dnSubmit');
  btn.disabled = true;
  btn.textContent = 'กำลังส่ง…';
  try {
    const res = await api('/api/donate', {
      method: 'POST',
      body: {
        streamer: ST.profile.username, sticker_code: st.code, sticker_only: true,
        display_name: from,
        hide_email: document.getElementById('dnHideEmail').checked,
      },
    });
    ST.me.token_balance = res.balance;
    document.getElementById('dnMsg').dataset.prev = '';
    selectSticker(null);
    updateNavBalance(ST.me.token_balance);
    playUiSound('success');
    if (window.Swal) Swal.fire({ icon: 'success', title: `ส่ง${st.name}แล้ว! ${st.emoji || ''}`, text: `${ST.profile.display_name} จะเห็นสติกเกอร์ของคุณบนไลฟ์`, confirmButtonText: 'ตกลง' });
  } catch (e) {
    toast(e.message, false);
  } finally {
    btn.disabled = false;
    renderAccount();
  }
}
