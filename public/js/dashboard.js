let ME, STICKERS = [];

(async function () {
  ME = await getMe();
  if (!ME) { location.href = '/login.html'; return; }
  mountNav(ME);

  document.getElementById('bal').innerHTML = tkAmount(ME.token_balance);
  document.getElementById('acctUsername').value = ME.username || '';
  document.getElementById('acctEmail').value = ME.email || '';
  document.getElementById('dispName').value = ME.display_name || '';
  if (!ME.email_verified) document.getElementById('verifyWarn').style.display = '';
  if (ME.role === 'donor') document.getElementById('becomeStreamer').style.display = '';

  document.getElementById('acctDisplayName').textContent = ME.display_name || ME.username;
  document.getElementById('acctRoleLabel').textContent = '@' + ME.username + ' · ' + roleLabel(ME.role);
  renderAvatar();
  document.getElementById('p_category').value = ME.creator_category || '';
  document.getElementById('p_bio').value = ME.bio || '';
  document.getElementById('bioCount').textContent = (ME.bio || '').length + '/160';
  initSocialModal();
  document.getElementById('p_first').value = ME.first_name || '';
  document.getElementById('p_last').value = ME.last_name || '';
  document.getElementById('p_nickname').value = ME.nickname || '';
  document.getElementById('p_nid').value = ME.national_id || '';
  document.getElementById('p_dob').value = ME.birth_date || '';
  document.getElementById('p_addr').value = ME.address_line || '';
  document.getElementById('p_subdistrict').value = ME.address_subdistrict || '';
  document.getElementById('p_district').value = ME.address_district || '';
  document.getElementById('p_province').value = ME.address_province || '';
  document.getElementById('p_zip').value = ME.address_zipcode || '';
  await initAddressPicker();

  // ลิงก์เก่าแบบ /dashboard.html?to=ชื่อ → ย้ายไปหน้าโดเนทสาธารณะ /u/ชื่อ
  const to = new URLSearchParams(location.search).get('to');
  if (to) { location.replace('/u/' + encodeURIComponent(to)); return; }

  document.getElementById('becomeStreamer').onclick = async () => {
    if (!(await confirmBecomeStreamer())) return;
    try {
      await api('/api/me/become-streamer', { method: 'POST' });
      if (window.Swal) {
        playUiSound('success');
        await Swal.fire({ icon: 'success', title: 'อัปเกรดเป็นสตรีมเมอร์แล้ว', text: 'เริ่มทดลองใช้ฟรี 21 วัน — ตั้งค่า Overlay และแชร์ลิงก์หน้าโดเนทได้เลย', confirmButtonText: 'ตกลง' });
      }
      location.reload();
    } catch (e) { toast(e.message, false); }
  };
  document.getElementById('saveName').onclick = async () => {
    try {
      await api('/api/me', { method: 'PATCH', body: { display_name: document.getElementById('dispName').value } });
      ME.display_name = document.getElementById('dispName').value;
      document.getElementById('acctDisplayName').textContent = ME.display_name || ME.username;
      renderAvatar();
      toast('บันทึกแล้ว');
    } catch (e) { toast(e.message, false); }
  };
  document.getElementById('p_bio').oninput = (e) => {
    document.getElementById('bioCount').textContent = e.target.value.length + '/160';
  };
  document.getElementById('saveBio').onclick = async () => {
    try {
      await api('/api/me', {
        method: 'PATCH',
        body: {
          bio: document.getElementById('p_bio').value,
          creator_category: document.getElementById('p_category').value,
        },
      });
      ME.bio = document.getElementById('p_bio').value;
      ME.creator_category = document.getElementById('p_category').value;
      toast('บันทึกโปรไฟล์สาธารณะแล้ว');
    } catch (e) { toast(e.message, false); }
  };
  document.getElementById('saveEmail').onclick = async () => {
    const email = document.getElementById('acctEmail').value.trim();
    const out = document.getElementById('emailOut');
    if (!email || email === ME.email) return;
    try {
      const r = await api('/api/me/email', { method: 'POST', body: { email } });
      if (r.unchanged) { out.textContent = ''; return; }
      ME.email = email;
      ME.email_verified = false;
      document.getElementById('verifyWarn').style.display = '';
      out.textContent = '';
      if (r.mailSent) {
        out.textContent = 'ส่งลิงก์ยืนยันไปที่อีเมลใหม่แล้ว กรุณายืนยันก่อนใช้งานฟีเจอร์ที่ต้องยืนยันอีเมล';
      } else {
        out.append('ยังไม่ได้ตั้งค่าระบบส่งอีเมล — ใช้ลิงก์นี้เพื่อยืนยัน: ');
        if (r.devLink) out.append(el('a', { href: r.devLink, target: '_blank' }, r.devLink));
      }
      toast('บันทึกอีเมลแล้ว รอการยืนยัน');
    } catch (e) { toast(e.message, false); }
  };
  document.getElementById('saveProfile').onclick = async () => {
    try {
      await api('/api/me', {
        method: 'PATCH',
        body: {
          first_name: document.getElementById('p_first').value,
          last_name: document.getElementById('p_last').value,
          nickname: document.getElementById('p_nickname').value,
          national_id: document.getElementById('p_nid').value,
          birth_date: document.getElementById('p_dob').value,
          address_line: document.getElementById('p_addr').value,
          address_subdistrict: document.getElementById('p_subdistrict').value,
          address_district: document.getElementById('p_district').value,
          address_province: document.getElementById('p_province').value,
          address_zipcode: document.getElementById('p_zip').value,
        },
      });
      toast('บันทึกข้อมูลผู้ใช้งานแล้ว');
    } catch (e) { toast(e.message, false); }
  };
  initImageEditor();
  initCoverEditor();
  document.getElementById('savePw').onclick = async () => {
    const next = document.getElementById('pwNew').value;
    const confirm = document.getElementById('pwConfirm').value;
    if (next !== confirm) return toast('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน', false);
    try {
      await api('/api/me/password', {
        method: 'POST',
        body: { current: document.getElementById('pwCur').value, next },
      });
      toast('เปลี่ยนรหัสผ่านแล้ว');
      document.getElementById('pwCur').value = '';
      document.getElementById('pwNew').value = '';
      document.getElementById('pwConfirm').value = '';
    } catch (e) { toast(e.message, false); }
  };

  loadSent();
  document.getElementById('sentExportExcel').onclick = (e) => { e.preventDefault(); exportSentExcel(); };
  document.getElementById('sentExportPdf').onclick = (e) => { e.preventDefault(); exportSentPdf(); };
  if (ME.role === 'streamer' || ME.role === 'admin') initStreamer();
  initRealtime();
  initTabs();
})();

// ---------- sidebar navigation ----------
const MOBILE_NAV_MQ = window.matchMedia('(max-width: 780px)');

function initTabs() {
  const items = document.querySelectorAll('.sidebar-item, .support-switch button');
  items.forEach((btn) => (btn.onclick = () => switchTab(btn.dataset.tab)));
  window.addEventListener('hashchange', () => switchTab(location.hash.slice(1)));
  MOBILE_NAV_MQ.addEventListener('change', () => switchTab(location.hash.slice(1)));
  switchTab(location.hash.slice(1));
}

function switchTab(tab) {
  const panels = [...document.querySelectorAll('.tab-panel')];
  if (!panels.some((p) => p.dataset.panel === tab)) {
    const items = [...document.querySelectorAll('.sidebar-item')];
    const target = items.find((b) => b.style.display !== 'none');
    tab = target ? target.dataset.tab : panels[0].dataset.panel;
  }

  document.querySelectorAll('.sidebar-item, .support-switch button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  panels.forEach((p) => (p.hidden = p.dataset.panel !== tab));

  // เนื้อหาอยู่ในพื้นที่เนื้อหาเสมอ — บนมือถือเมนูเป็นแถบเลื่อนแนวนอนด้านบน (CSS) แค่เลื่อนปุ่มที่เลือกให้อยู่ในจอ
  const content = document.querySelector('.dash-content');
  panels.forEach((p) => { if (p.parentElement !== content) content.appendChild(p); });
  if (MOBILE_NAV_MQ.matches) {
    const btn = document.querySelector(`#dashNav .sidebar-item[data-tab="${tab}"]`);
    if (btn) btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  if (location.hash.slice(1) !== tab) history.replaceState(null, '', '#' + tab);
}

function renderAvatar() {
  const img = document.getElementById('avatarPreview');
  const fb = document.getElementById('avatarFallback');
  if (ME.avatar_url) {
    img.src = ME.avatar_url;
    img.hidden = false;
    fb.hidden = true;
  } else {
    img.hidden = true;
    fb.hidden = false;
    fb.textContent = (ME.display_name || ME.username || '?').trim().charAt(0).toUpperCase();
  }
}

// ลิงก์ Overlay = ใครได้ไปก็ส่งแจ้งเตือนปลอมขึ้นจอได้ → เบลอไว้ เตือนก่อนแสดง (กันเผลอเปิดโชว์ตอนไลฟ์)
async function revealOverlayUrl() {
  if (window.Swal) {
    const r = await Swal.fire({
      title: 'ก่อนดูลิงก์ โปรดอ่านสิ่งนี้ก่อน',
      html: `<div class="secret-warn">
          <p>ลิงก์ Overlay ของคุณเป็นความลับ อย่าให้ใครรู้หรือเห็นลิงก์นี้</p>
          <p class="danger">ห้ามแสดงลิงก์นี้บนไลฟ์สตรีม</p>
          <p class="danger">ห้ามแชร์ลิงก์นี้ให้ใคร</p>
        </div>`,
      showCloseButton: true,
      confirmButtonText: 'แสดงลิงก์',
      customClass: { popup: 'secret-popup', confirmButton: 'secret-confirm' },
    });
    if (!r.isConfirmed) return;
  } else if (!confirm('ลิงก์ Overlay เป็นความลับ ห้ามแสดงบนไลฟ์และห้ามแชร์ให้ใคร — แสดงลิงก์?')) return;
  document.getElementById('overlaySecret').classList.add('revealed');
}

// ถามยืนยันก่อนอัปเกรดบัญชีผู้โดเนทเป็นสตรีมเมอร์ (เปลี่ยนกลับไม่ได้)
async function confirmBecomeStreamer() {
  if (!window.Swal) return confirm('อัปเกรดบัญชีเป็นสตรีมเมอร์? (เปลี่ยนกลับเป็นผู้โดเนทไม่ได้)');
  playUiSound('question');
  const r = await Swal.fire({
    icon: 'question',
    title: 'อัปเกรดบัญชีเป็นสตรีมเมอร์?',
    html: `<div class="up-confirm">
        <div>บัญชีสตรีมเมอร์จะได้:</div>
        <ul>
          <li>หน้าโดเนทของตัวเอง ให้ผู้ชมโดเนทและส่งสติกเกอร์</li>
          <li>Overlay แจ้งเตือนบนจอไลฟ์ใน OBS</li>
          <li>รับรายได้และถอนเงินเข้าบัญชี</li>
          <li><b>ทดลองใช้ฟรี 21 วัน</b> นับจากวันนี้</li>
        </ul>
        <div class="up-warn">⚠️ เปลี่ยนกลับเป็นบัญชีผู้โดเนทไม่ได้ (ยังโดเนทให้คนอื่นได้ตามปกติ)</div>
      </div>`,
    showCancelButton: true,
    confirmButtonText: 'ยืนยัน อัปเกรด',
    cancelButtonText: 'ยกเลิก',
    reverseButtons: true,
    focusCancel: true,
  });
  return r.isConfirmed;
}

// รูปพื้นหลัง (ปก) บนการ์ดหน้าสตรีมเมอร์ — เลือกไฟล์แล้วครอบตัด 3:1 ด้วย initImageEditor (ได้รูป 1200×400)
function renderCover() {
  const box = document.getElementById('coverPreview');
  box.style.backgroundImage = ME.cover_url ? `url("${ME.cover_url}")` : '';
  box.classList.toggle('has-img', !!ME.cover_url);
  document.getElementById('coverEmpty').hidden = !!ME.cover_url;
  document.getElementById('removeCover').hidden = !ME.cover_url;
}

function initCoverEditor() {
  renderCover();
  document.getElementById('removeCover').onclick = async () => {
    if (!(await confirmDialog('ลบรูปพื้นหลัง?', 'การ์ดของคุณในหน้าสตรีมเมอร์จะกลับไปใช้สีไล่ระดับแทน', { confirmText: 'ลบ', danger: true }))) return;
    try {
      await api('/api/me/cover', { method: 'DELETE' });
      ME.cover_url = null;
      renderCover();
      toast('ลบรูปพื้นหลังแล้ว');
    } catch (err) { toast(err.message, false); }
  };
}

// เปลี่ยนรูป 3 ขั้น (ใช้ร่วมกันระหว่างรูปโปรไฟล์กับรูปพื้นหลัง):
// ครอบตัด/หมุน (Cropper.js) → ดูตัวอย่าง (วงกลม / สี่เหลี่ยม 3:1) → กำลังบันทึก
const IMAGE_EDIT_MODES = {
  avatar: {
    aspect: 1, width: 512, height: 512, shape: 'circle', maxMb: 10,
    types: /^image\/(png|jpe?g|webp|gif)$/, typesLabel: 'PNG, JPG, WEBP, GIF',
    title: 'รูปโปรไฟล์ใหม่ของคุณ', info: 'รูปนี้จะแสดงบนแถบเมนู หน้าโดเนท และรายชื่อสตรีมเมอร์',
    saveLabel: 'บันทึกเป็นรูปโปรไฟล์', saving: 'กำลังบันทึกรูปโปรไฟล์…', done: 'อัปเดตรูปโปรไฟล์แล้ว',
    async save(image) {
      const r = await api('/api/me/avatar', { method: 'POST', body: { image } });
      ME.avatar_url = r.avatar_url;
      renderAvatar();
      // รูปบนแถบเมนู (user chip) เปลี่ยนตามทันที ไม่ต้องรีเฟรชหน้า
      const chipAv = document.querySelector('header.nav .user-chip-avatar');
      if (chipAv) chipAv.replaceWith(el('img', { class: 'user-chip-avatar', src: r.avatar_url, alt: '' }));
    },
  },
  cover: {
    aspect: 3, width: 1200, height: 400, shape: 'rect', maxMb: 10,
    types: /^image\/(png|jpe?g|webp)$/, typesLabel: 'PNG, JPG, WEBP',
    title: 'รูปพื้นหลังใหม่ของคุณ', info: 'รูปนี้จะแสดงเป็นปกการ์ดของคุณในหน้าสตรีมเมอร์',
    saveLabel: 'บันทึกเป็นรูปพื้นหลัง', saving: 'กำลังบันทึกรูปพื้นหลัง…', done: 'อัปเดตรูปพื้นหลังแล้ว',
    async save(image) {
      const r = await api('/api/me/cover', { method: 'POST', body: { image } });
      ME.cover_url = r.cover_url;
      renderCover();
    },
  },
};

function initImageEditor() {
  const modal = document.getElementById('avatarModal');
  const img = document.getElementById('avCropImg');
  const steps = { crop: 'avStepCrop', confirm: 'avStepConfirm', saving: 'avStepSaving' };
  let cropper = null, result = null, objectUrl = null, mode = null;

  const show = (name) => Object.entries(steps).forEach(([k, id]) => { document.getElementById(id).hidden = k !== name; });
  const close = () => {
    modal.hidden = true;
    if (cropper) { cropper.destroy(); cropper = null; }
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    result = null;
  };

  const open = (file, m) => {
    if (!file) return;
    if (!m.types.test(file.type)) return toast('รองรับเฉพาะ ' + m.typesLabel, false);
    if (file.size > m.maxMb * 1024 * 1024) return toast(`ไฟล์ใหญ่เกินไป (สูงสุด ${m.maxMb}MB)`, false);
    if (!window.Cropper) return toast('โหลดเครื่องมือครอบตัดรูปไม่สำเร็จ ลองรีเฟรชหน้า', false);
    mode = m;
    modal.classList.toggle('is-rect', m.shape === 'rect');
    document.getElementById('avConfirmTitle').textContent = m.title;
    document.getElementById('avInfoText').textContent = m.info;
    document.getElementById('avSave').textContent = m.saveLabel;
    document.getElementById('avSavingText').textContent = m.saving;

    objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    show('crop');
    modal.hidden = false;
    img.onload = () => {
      if (cropper) cropper.destroy();
      cropper = new Cropper(img, {
        aspectRatio: m.aspect, viewMode: 1, dragMode: 'move', autoCropArea: m.shape === 'rect' ? 1 : 0.85,
        background: false, guides: false, center: false, highlight: false,
        toggleDragModeOnDblclick: false, responsive: true,
      });
    };
  };

  document.getElementById('avatarInput').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; open(f, IMAGE_EDIT_MODES.avatar); };
  document.getElementById('coverInput').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; open(f, IMAGE_EDIT_MODES.cover); };

  document.getElementById('avRotate').onclick = () => cropper && cropper.rotate(-90);
  document.getElementById('avBack').onclick = close;
  // ยกเลิกในหน้าตัวอย่าง = กลับไปแก้การครอบตัด/หมุนต่อ (cropper ยังอยู่ ตำแหน่งกรอบและการหมุนเดิมไม่หาย)
  document.getElementById('avCancel').onclick = () => { result = null; show('crop'); };
  modal.addEventListener('click', (e) => { if (e.target === modal && modal.querySelector('#avStepSaving').hidden) close(); });

  document.getElementById('avNext').onclick = () => {
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas({ width: mode.width, height: mode.height, imageSmoothingQuality: 'high' });
    if (!canvas) return;
    // webp รองรับพื้นโปร่งใส — เบราว์เซอร์ที่ encode webp ไม่ได้จะได้ png แทนอัตโนมัติ (เซิร์ฟเวอร์รับทั้งคู่)
    result = canvas.toDataURL('image/webp', mode.shape === 'rect' ? 0.88 : 0.92);
    document.getElementById('avResult').src = result;
    show('confirm');
  };

  document.getElementById('avSave').onclick = async () => {
    if (!result) return;
    document.getElementById('avSavingImg').src = result;
    show('saving');
    try {
      // แสดงหน้ากำลังบันทึกอย่างน้อยครู่หนึ่ง ไม่ให้กะพริบหายเร็วเกินจนดูไม่ทัน
      await Promise.all([mode.save(result), new Promise((ok) => setTimeout(ok, 900))]);
      close();
      toast(mode.done);
    } catch (err) {
      show('confirm');
      toast(err.message, false);
    }
  };
}

async function refreshBalance() {
  ME = await getMe();
  document.getElementById('bal').innerHTML = tkAmount(ME.token_balance);
  const e1 = document.getElementById('earn'); if (e1) e1.textContent = fmt(ME.earnings_balance) + ' บาท';
  const e2 = document.getElementById('earn2'); if (e2) e2.textContent = 'THB' + fmt(ME.earnings_balance);
}

let SENT_ROWS = [];
const SENT_HEADER = ['วันที่และเวลา', 'ถึง', 'จำนวนเงิน', 'สติกเกอร์', 'ข้อความ'];
// กรองประวัติโดเนทตามช่องค้นหา (ชื่อสตรีมเมอร์ / ข้อความ / ชื่อหรือโค้ดสติกเกอร์ / จำนวนเงิน) — ใช้ทั้งตารางและไฟล์ที่ดาวน์โหลด
function filteredSent() {
  const q = (document.getElementById('sentSearch').value || '').trim().toLowerCase().replace(/^@/, '');
  if (!q) return SENT_ROWS;
  return SENT_ROWS.filter((d) => {
    const st = STICKERS.find((x) => x.code === d.sticker_code);
    return [d.streamer_username, d.message, d.sticker_code, st && st.name, String(d.amount), ...dateSearchTexts(d.created_at)]
      .some((v) => (v || '').toLowerCase().includes(q));
  });
}
// วันที่ในหลายรูปแบบให้ค้นได้: "6/10/2569 14:30" (พ.ศ. ตามที่แสดงในตาราง), "6/10/2026", "06/10/2026", "2026-10-06", "6 ต.ค. 2569", "ตุลาคม"
function dateSearchTexts(ts) {
  const dt = new Date(ts);
  const p2 = (n) => String(n).padStart(2, '0');
  const d = dt.getDate(), m = dt.getMonth() + 1, y = dt.getFullYear();
  return [
    dt.toLocaleString('th-TH'),
    `${d}/${m}/${y}`, `${p2(d)}/${p2(m)}/${y}`, `${p2(d)}/${p2(m)}/${y + 543}`,
    `${y}-${p2(m)}-${p2(d)}`,
    dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }),
    dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }),
  ];
}
function sentRows() {
  return filteredSent().map((d) => {
    const st = STICKERS.find((x) => x.code === d.sticker_code);
    return [new Date(d.created_at).toLocaleString('th-TH'), '@' + d.streamer_username, d.amount,
      d.sticker_code ? (st ? st.name : d.sticker_code) : '', d.message || ''];
  });
}
function exportSentExcel() { exportCsv('my-donations.csv', SENT_HEADER, sentRows()); }
function exportSentPdf() {
  return exportTablePdf('my-donations.pdf', 'ประวัติการโดเนทของฉัน', SENT_HEADER,
    sentRows().map((r) => [r[0], r[1], fmt(r[2]) + ' ฿', r[3] || '-', r[4]]));
}

async function loadSent() {
  const [rows, stickers] = await Promise.all([
    api('/api/donate/sent').catch(() => []),
    STICKERS.length ? STICKERS : api('/api/public/stickers').catch(() => []),
  ]);
  STICKERS = stickers;
  SENT_ROWS = rows;
  document.getElementById('sentSearch').oninput = renderSent;
  renderSent();
}

function renderSent() {
  const stickerLabel = (code) => {
    if (!code) return '-';
    const st = STICKERS.find((x) => x.code === code);
    return st ? `${st.emoji || ''} ${esc(st.name)}` : esc(code);
  };
  const rows = filteredSent();
  const empty = SENT_ROWS.length ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีรายการโดเนท';
  document.getElementById('sentHist').innerHTML = rows.map((d) =>
    `<tr><td>${new Date(d.created_at).toLocaleString('th-TH')}</td>`
    + `<td><a href="/u/${encodeURIComponent(d.streamer_username)}">@${esc(d.streamer_username)}</a></td>`
    + `<td>${fmt(d.amount)} ฿</td><td>${stickerLabel(d.sticker_code)}</td><td>${esc(d.message || '')}</td></tr>`
  ).join('') || `<tr><td colspan="5" class="muted">${empty}</td></tr>`;
}

// ---------- แพลน: รายละเอียด + นับถอยหลังถึงวันหมดอายุ + ประวัติการสมัคร ----------
const fmtDateTime = (ts) => new Date(ts).toLocaleString('th-TH', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
}) + ' น.';
const fmtShortDate = (ts) => new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
let planTimer = null;

async function initPlanPanels() {
  document.getElementById('pdToHistory').onclick = () => switchTab('planhistory');
  let d;
  try { d = await api('/api/me/plan'); } catch (e) { return toast(e.message, false); }
  renderPlanDetail(d);
  renderPlanHistory(d);
}

function renderPlanDetail(d) {
  const s = d.status;
  const name = s.kind === 'unlimited' ? 'แอดมิน — ไม่จำกัด' : s.kind === 'trial' ? 'ทดลองใช้ฟรี' : 'แพลน ' + d.period_label;
  document.getElementById('pdName').textContent = name;
  const badge = document.getElementById('pdBadge');
  badge.textContent = s.kind === 'unlimited' ? 'ไม่มีวันหมดอายุ' : s.active ? 'ใช้งานอยู่' : 'หมดอายุแล้ว';
  badge.className = 'pd-badge ' + (s.active ? 'on' : 'off');
  document.getElementById('pdAccept').textContent = s.active ? '🟢 เปิดรับโดเนท' : '🔴 ปิดรับโดเนทชั่วคราว';
  document.getElementById('pdBuy').textContent = s.active ? 'ต่ออายุแพลน' : 'ซื้อแพลนเพื่อเปิดรับโดเนท';

  if (s.kind === 'unlimited') {
    document.getElementById('pdCountdown').hidden = true;
    document.querySelector('.pd-progress').hidden = true;
    document.querySelector('.pd-progress-lbl').hidden = true;
    document.getElementById('pdStart').textContent = '—';
    document.getElementById('pdEnd').textContent = 'ไม่มีวันหมดอายุ';
    document.getElementById('pdBuy').hidden = true;
    return;
  }
  document.getElementById('pdStart').textContent = d.period_start ? fmtDateTime(d.period_start) : '—';
  document.getElementById('pdEnd').textContent = fmtDateTime(s.expires_at);

  // นับถอยหลังทุกวินาที + แถบเวลาที่ใช้ไปแล้วของช่วงปัจจุบัน
  const tick = () => {
    const left = Math.max(0, s.expires_at - Date.now());
    const sec = Math.floor(left / 1000);
    document.getElementById('pdD').textContent = Math.floor(sec / 86400);
    document.getElementById('pdH').textContent = Math.floor((sec % 86400) / 3600);
    document.getElementById('pdM').textContent = Math.floor((sec % 3600) / 60);
    document.getElementById('pdS').textContent = sec % 60;
    const total = s.expires_at - (d.period_start || s.expires_at);
    const usedPct = total > 0 ? Math.min(100, Math.max(0, ((Date.now() - d.period_start) / total) * 100)) : 100;
    document.getElementById('pdBar').style.width = (100 - usedPct) + '%';
    document.getElementById('pdUsed').textContent = 'ใช้ไปแล้ว ' + usedPct.toFixed(1) + '%';
    document.getElementById('pdLeftPct').textContent = 'คงเหลือ ' + (100 - usedPct).toFixed(1) + '%';
    document.getElementById('pdBar').classList.toggle('low', 100 - usedPct < 15);
    if (!left) clearInterval(planTimer);
  };
  clearInterval(planTimer);
  tick();
  planTimer = setInterval(tick, 1000);
}

function renderPlanHistory(d) {
  const t = Date.now();
  document.getElementById('planHist').innerHTML = d.history.map((h) => {
    let state;
    if (!h.starts_at || !h.expires_at) state = '<span class="pd-st">—</span>';
    else if (t < h.starts_at) state = '<span class="pd-st wait">รอเริ่มใช้งาน</span>';
    else if (t < h.expires_at) state = '<span class="pd-st on">กำลังใช้งาน</span>';
    else state = '<span class="pd-st">หมดอายุแล้ว</span>';
    const range = h.starts_at && h.expires_at ? `${fmtShortDate(h.starts_at)} – ${fmtShortDate(h.expires_at)}` : '—';
    const label = h.kind === 'trial' ? `ทดลองใช้ฟรี ${h.days} วัน` : `${esc(h.label)} (${h.days} วัน)`;
    return `<tr><td>${fmtShortDate(h.created_at)}</td><td>${label}</td><td>${h.price ? tkAmount(h.price) : 'ฟรี'}</td><td>${range}</td><td>${state}</td></tr>`;
  }).join('');
}

// ---------- streamer ----------
async function initStreamer() {
  document.getElementById('navPlan').style.display = '';
  document.getElementById('navPlanHistory').style.display = '';
  initPlanPanels();
  document.getElementById('navSectionEarn').style.display = '';
  document.getElementById('navSettings').style.display = '';
  document.getElementById('navOverlay').style.display = '';
  document.getElementById('navEarnings').style.display = '';
  document.getElementById('navSupportGroup').style.display = '';
  document.getElementById('navSupportItems').style.display = '';
  document.getElementById('navSupportGroup').onclick = () => {
    document.getElementById('navSupportGroup').classList.toggle('collapsed');
    document.getElementById('navSupportItems').classList.toggle('collapsed');
  };
  document.getElementById('earnBox').style.display = '';
  document.getElementById('earn').textContent = fmt(ME.earnings_balance) + ' บาท';
  document.getElementById('earn2').textContent = 'THB' + fmt(ME.earnings_balance);

  const d = await api('/api/streamer/settings');
  const s = d.settings;
  const url = location.origin + d.overlay_url;
  document.getElementById('overlayUrl').textContent = url;
  document.getElementById('btnOpenNewTab').href = d.overlay_url;
  const copyOverlayUrl = () => { navigator.clipboard.writeText(document.getElementById('overlayUrl').textContent); toast('คัดลอกแล้ว'); };
  document.getElementById('btnCopyLink').onclick = copyOverlayUrl;
  document.getElementById('copyOverlayUrl').onclick = copyOverlayUrl;
  document.getElementById('revealOverlayUrl').onclick = revealOverlayUrl;
  document.getElementById('rotateOverlay').onclick = async () => {
    const r = await api('/api/streamer/overlay/rotate', { method: 'POST' });
    const u = location.origin + r.overlay_url;
    document.getElementById('overlayUrl').textContent = u;
    document.getElementById('btnOpenNewTab').href = r.overlay_url;
    // ลิงก์ใหม่ก็ซ่อนไว้ก่อนเหมือนเดิม
    document.getElementById('overlaySecret').classList.remove('revealed');
    toast('สร้าง URL ใหม่แล้ว');
  };
  const donatePath = '/u/' + encodeURIComponent(ME.username);
  document.getElementById('donatePageUrl').textContent = location.origin + donatePath;
  document.getElementById('openDonatePage').href = donatePath;
  document.getElementById('copyDonatePage').onclick = () => {
    navigator.clipboard.writeText(location.origin + donatePath);
    toast('คัดลอกลิงก์หน้าโดเนทแล้ว');
  };

  document.getElementById('btnTestAlert').onclick = () => sendTestAlert({ amount: 99, display_name: 'ทดสอบระบบ' });
  document.getElementById('btnCustomTestAlert').onclick = () => {
    document.getElementById('customTestForm').hidden = !document.getElementById('customTestForm').hidden;
  };

  const set = (id, v) => (document.getElementById(id).value = v);
  set('s_dur', Math.round((s.alert_duration_ms || 10000) / 1000)); set('s_minalert', s.min_alert_amount);
  set('s_accent', s.accent_color); set('s_text', s.text_color);
  set('s_connector', s.connector_color || '#ffffff');
  set('s_title', s.title_template);
  set('s_wordFilter', s.word_filter || '');
  set('s_ttsMinAmount', s.tts_min_amount || 1);
  set('s_gifMin', s.gif_min_amount || 0);
  set('s_voiceMsgMin', s.voice_msg_min_amount || 5); set('s_voiceMsgMax', s.voice_msg_max_sec || 5);
  set('s_audioMsgMin', s.audio_msg_min_amount || 1); set('s_audioMsgMax', s.audio_msg_max_sec || 15);
  document.getElementById('s_sound').checked = !!s.sound_enabled;
  document.getElementById('s_tts').checked = !!s.tts_enabled;
  document.getElementById('s_ttsMinEnabled').checked = !!s.tts_min_amount_enabled;
  document.getElementById('s_ttsReadSymbols').checked = s.tts_read_symbols !== 0;
  document.getElementById('s_ttsPersist').checked = s.tts_persist_after_hide !== 0;
  document.getElementById('s_showCurrency').checked = s.show_currency !== 0;
  document.getElementById('s_gifEnabled').checked = !!s.gif_enabled;
  document.getElementById('s_voiceMsgEnabled').checked = !!s.voice_msg_enabled;
  document.getElementById('s_audioMsgEnabled').checked = !!s.audio_msg_enabled;

  document.getElementById('wordFilterCount').textContent = (s.word_filter || '').length + '/100';
  document.getElementById('s_wordFilter').oninput = (e) => {
    document.getElementById('wordFilterCount').textContent = e.target.value.length + '/100';
  };

  syncSwatchesFromHidden();
  renderUploadPreview('sound', s.custom_sound_url);
  renderUploadPreview('gif', s.custom_gif_url);
  initTtsVoicePicker(s.tts_voice_name || '');
  initAiTts(s, d.ai_voices || [], !!d.ai_tts_configured);
  initMediaUploads();
  initTiers();

  initOverlayAutoSave();
  initOverlayPreview();

  const ts = document.getElementById('tSticker');
  ts.append(el('option', { value: '' }, '— ไม่มีสติกเกอร์ —'));
  (STICKERS.length ? STICKERS : await api('/api/public/stickers')).forEach((x) =>
    ts.append(el('option', { value: x.code }, (x.emoji || '⭐') + ' ' + x.name)));
  document.getElementById('tGo').onclick = () => sendTestAlert({
    amount: +document.getElementById('tAmount').value,
    display_name: document.getElementById('tName').value,
    sticker_code: ts.value || undefined,
  });

  initWithdraw();
  initEarningsSwitch();

  loadStreamerHist();
  loadAllTransactions();
  loadSupporters();
  initStats();
}

// ---------- realtime: มีโดเนทเข้า/ส่งโดเนท → โหลดตาราง + ยอดเงินใหม่ทันที (socket ใช้ session ของเว็บ) ----------
function initRealtime() {
  if (!window.io) return;
  const socket = io();
  socket.on('donation:received', async () => {
    if (ME.role === 'donor') return;
    await Promise.all([loadAllTransactions({ flashNew: true }), loadStreamerHist(), loadSupporters(), refreshBalance()]);
    if (window.refreshNotifications) window.refreshNotifications();
  });
  socket.on('donation:sent', () => { loadSent(); refreshBalance(); });
  // แอดมินอนุมัติ/ปฏิเสธคำขอถอน หรือแนบสลิป → อัปเดตประวัติการถอน + ยอดรายได้ + กระดิ่ง
  socket.on('payout:updated', () => {
    loadStreamerHist();
    refreshBalance();
    if (window.refreshNotifications) window.refreshNotifications();
  });
}

// ---------- ทุกธุรกรรม: ค้นหา / เรียงลำดับ / ตอบกลับ / export ----------
let txAllRows = [];
let txSort = { key: 'created_at', dir: 'desc' };

let txSeenIds = null;
async function loadAllTransactions({ flashNew = false } = {}) {
  txAllRows = await api('/api/streamer/transactions').catch(() => []);
  // รายการที่เพิ่งเข้ามา (ไม่เคยเห็นในรอบก่อน) ไฮไลต์สั้น ๆ
  const fresh = flashNew && txSeenIds ? new Set(txAllRows.filter((d) => !txSeenIds.has(d.id)).map((d) => d.id)) : new Set();
  txSeenIds = new Set(txAllRows.map((d) => d.id));
  initTxControls();
  renderTxTable(fresh);
}

function initTxControls() {
  document.getElementById('txSearch').oninput = renderTxTable;
  document.querySelectorAll('[data-panel="transactions"] th.sortable').forEach((th) => {
    th.onclick = () => {
      const key = th.dataset.sort;
      txSort = { key, dir: txSort.key === key && txSort.dir === 'asc' ? 'desc' : 'asc' };
      renderTxTable();
    };
  });
  document.getElementById('txExportExcel').onclick = (e) => { e.preventDefault(); exportTxExcel(); };
  document.getElementById('txExportPdf').onclick = (e) => { e.preventDefault(); exportTxPdf(); };
}

function getFilteredSortedTx() {
  const q = (document.getElementById('txSearch').value || '').trim().toLowerCase();
  // ค้นได้ทั้งชื่อผู้โดเนทและวันที่ (รูปแบบเดียวกับประวัติการโดเนทของฉัน)
  let rows = q
    ? txAllRows.filter((d) => [d.display_name, ...dateSearchTexts(d.created_at)].some((v) => (v || '').toLowerCase().includes(q)))
    : txAllRows.slice();
  const { key, dir } = txSort;
  rows.sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === 'display_name') { av = (av || '').toLowerCase(); bv = (bv || '').toLowerCase(); }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
  return rows;
}

function renderTxTable(fresh) {
  const rows = getFilteredSortedTx();
  const isNew = (d) => fresh instanceof Set && fresh.has(d.id);
  document.querySelectorAll('[data-panel="transactions"] th.sortable').forEach((th) => {
    th.classList.toggle('sort-asc', th.dataset.sort === txSort.key && txSort.dir === 'asc');
    th.classList.toggle('sort-desc', th.dataset.sort === txSort.key && txSort.dir === 'desc');
  });
  document.getElementById('allTxHist').innerHTML = rows.map((d) => `<tr${isNew(d) ? ' class="row-new"' : ''}>
      <td>${esc(d.display_name)}</td>
      <td>${new Date(d.created_at).toLocaleString('th-TH')}</td>
      <td>${fmt(d.amount)} ฿</td>
      <td>${fmt(d.streamer_credit)}</td>
      <td>${esc(d.sticker_code || '-')}</td>
      <td>${esc(d.message || '')}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="muted">ข้อมูลไม่พร้อมใช้งาน</td></tr>';
}

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- export กลาง: Excel (CSV) / PDF จากตาราง ----------
function exportCsv(filename, header, rows) {
  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
  // ใส่ BOM (\uFEFF) นำหน้า ไม่งั้น Excel เปิดไฟล์ CSV ภาษาไทยแล้วตัวอักษรเพี้ยน
  downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }), filename);
}

async function exportTablePdf(filename, title, header, rows) {
  if (!window.jspdf || !window.html2canvas) return toast('โหลดเครื่องมือสร้าง PDF ไม่สำเร็จ (ตรวจการเชื่อมต่ออินเทอร์เน็ต)', false);
  // สร้างตาราง HTML ชั่วคราวนอกจอแล้วแคปเป็นรูปด้วย html2canvas ก่อนฝังลง PDF
  // (ไม่พิมพ์ข้อความตรงใน jsPDF เพราะฟอนต์มาตรฐานของ jsPDF ไม่รองรับภาษาไทย จะได้สี่เหลี่ยมว่างแทนตัวอักษร)
  const cell = 'padding:6px;border:1px solid #ddd';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;background:#fff;color:#000;padding:16px;width:960px;font-family:"Segoe UI",Tahoma,sans-serif';
  wrap.innerHTML = `<h2 style="margin:0 0 4px">${esc(title)}</h2>
    <div style="font-size:11px;color:#666;margin-bottom:12px">@${esc(ME.username)} · ส่งออกเมื่อ ${esc(new Date().toLocaleString('th-TH'))} · ${rows.length} รายการ</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#f1f2f6">${header.map((h) => `<th style="text-align:left;${cell}">${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((v) => `<td style="${cell}">${esc(v)}</td>`).join('')}</tr>`).join('')
        || `<tr><td colspan="${header.length}" style="${cell};color:#888">ไม่มีข้อมูล</td></tr>`}</tbody>
    </table>`;
  document.body.append(wrap);
  try {
    const canvas = await html2canvas(wrap, { scale: 2, backgroundColor: '#ffffff' });
    // JPEG เล็กกว่า PNG หลายเท่า (PNG ของตารางขนาด A4 ที่ scale 2 ได้หลาย MB)
    const imgData = canvas.toDataURL('image/jpeg', 0.9);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
    const margin = 20;
    const imgW = pageW - margin * 2;
    const imgH = (canvas.height * imgW) / canvas.width;
    const usableH = pageH - margin * 2;
    let heightLeft = imgH, offset = 0;
    doc.addImage(imgData, 'JPEG', margin, margin, imgW, imgH);
    heightLeft -= usableH;
    while (heightLeft > 0) {
      offset += usableH;
      doc.addPage();
      doc.addImage(imgData, 'JPEG', margin, margin - offset, imgW, imgH);
      heightLeft -= usableH;
    }
    doc.save(filename);
  } catch (e) {
    toast('สร้าง PDF ไม่สำเร็จ: ' + e.message, false);
  } finally {
    wrap.remove();
  }
}

const TX_HEADER = ['ชื่อ', 'วันที่และเวลา', 'จำนวนเงิน', 'รับสุทธิ', 'สติกเกอร์', 'ข้อความ'];
function txRows() {
  return getFilteredSortedTx().map((d) => [
    d.display_name, new Date(d.created_at).toLocaleString('th-TH'), d.amount, d.streamer_credit,
    d.sticker_code || '', d.message || '',
  ]);
}
function exportTxExcel() { exportCsv('transactions.csv', TX_HEADER, txRows()); }
function exportTxPdf() {
  return exportTablePdf('transactions.pdf', 'ทุกธุรกรรม', TX_HEADER,
    txRows().map((r) => [r[0], r[1], fmt(r[2]) + ' ฿', fmt(r[3]), r[4] || '-', r[5]]));
}

async function sendTestAlert(body) {
  try {
    await api('/api/streamer/test-alert', { method: 'POST', body });
    toast('ส่งทดสอบไปที่ Overlay แล้ว');
  } catch (e) { toast(e.message, false); }
}

// ---------- ปรับแต่ง Overlay: preview สด + สไตล์สำเร็จรูป ----------
const OVERLAY_STYLES = {
  1: { accent: '#34d399', text: '#ffffff', connector: '#ffffff' },
  2: { accent: '#60a5fa', text: '#ffffff', connector: '#ffffff' },
};

function initOverlayPreview() {
  const ids = ['s_title', 's_showCurrency'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => { markStyleCustom(); updateOverlayPreview(); });
  });

  document.getElementById('styleSeg').querySelectorAll('button').forEach((btn) => {
    btn.onclick = () => {
      const key = btn.dataset.style;
      if (OVERLAY_STYLES[key]) {
        document.getElementById('s_accent').value = OVERLAY_STYLES[key].accent;
        document.getElementById('s_text').value = OVERLAY_STYLES[key].text;
        document.getElementById('s_connector').value = OVERLAY_STYLES[key].connector;
        syncSwatchesFromHidden();
        autoSaveColors();
      }
      setActiveSeg('styleSeg', btn);
      updateOverlayPreview();
    };
  });

  initColorSwatches();
  updateOverlayPreview();
}

function markStyleCustom() {
  const btn = document.querySelector('#styleSeg button[data-style="custom"]');
  if (btn) setActiveSeg('styleSeg', btn);
}

// ---------- สี: วงกลมเลือกสี (เหมือนหน้า "สี" ของ SociaBuzz) — เปลี่ยนสีแล้วบันทึกอัตโนมัติทันที ----------
function parseColorToHexAlpha(str) {
  str = String(str || '').trim();
  let m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(str);
  if (m) {
    const hex = '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('');
    return { hex, alpha: m[4] !== undefined ? parseFloat(m[4]) : 1 };
  }
  m = /^#([0-9a-f]{6})$/i.exec(str);
  if (m) return { hex: '#' + m[1], alpha: 1 };
  return { hex: '#ffffff', alpha: 1 };
}

function syncSwatchesFromHidden() {
  document.getElementById('s_accentSwatch').value = parseColorToHexAlpha(document.getElementById('s_accent').value).hex;
  document.getElementById('s_textSwatch').value = parseColorToHexAlpha(document.getElementById('s_text').value).hex;
  document.getElementById('s_connectorSwatch').value = parseColorToHexAlpha(document.getElementById('s_connector').value).hex;
  // พื้นหลังกล่องบังคับโปร่งใสเสมอ ไม่มีสวิตช์ให้ปรับ
  document.getElementById('s_bg').value = 'transparent';
}

function initColorSwatches() {
  const accentSwatch = document.getElementById('s_accentSwatch');
  const textSwatch = document.getElementById('s_textSwatch');
  const connectorSwatch = document.getElementById('s_connectorSwatch');

  // 'input' ยิงรัวระหว่างลากเลือกสี ใช้แค่อัปเดต preview ให้เห็นสด ๆ
  accentSwatch.oninput = (e) => {
    document.getElementById('s_accent').value = e.target.value;
    markStyleCustom(); updateOverlayPreview();
  };
  textSwatch.oninput = (e) => {
    document.getElementById('s_text').value = e.target.value;
    markStyleCustom(); updateOverlayPreview();
  };
  connectorSwatch.oninput = (e) => {
    document.getElementById('s_connector').value = e.target.value;
    markStyleCustom(); updateOverlayPreview();
  };

  // 'change' ยิงครั้งเดียวตอนปิดกล่องเลือกสี/ยืนยันค่า — ค่อยบันทึกขึ้นเซิร์ฟเวอร์ตอนนี้
  accentSwatch.addEventListener('change', autoSaveColors);
  textSwatch.addEventListener('change', autoSaveColors);
  connectorSwatch.addEventListener('change', autoSaveColors);
}

function autoSaveColors() { scheduleOverlaySave(0); }

// ---------- บันทึกอัตโนมัติ: ทุกช่องในหน้า "ปรับแต่ง Overlay" ----------
const $v = (id) => document.getElementById(id).value;
const $c = (id) => document.getElementById(id).checked;

function collectOverlaySettings() {
  return {
    alert_duration_ms: +$v('s_dur') * 1000,
    min_alert_amount: +$v('s_minalert'),
    accent_color: $v('s_accent'),
    text_color: $v('s_text'),
    connector_color: $v('s_connector'),
    bg_color: $v('s_bg'),
    title_template: $v('s_title'),
    sound_enabled: $c('s_sound'),
    tts_enabled: $c('s_tts'),
    tts_min_amount_enabled: $c('s_ttsMinEnabled'),
    tts_min_amount: +$v('s_ttsMinAmount'),
    tts_read_symbols: $c('s_ttsReadSymbols'),
    tts_persist_after_hide: $c('s_ttsPersist'),
    show_currency: $c('s_showCurrency'),
    word_filter: $v('s_wordFilter'),
    tts_voice_name: $v('s_ttsVoice'),
    tts_engine: $v('s_ttsEngine'),
    tts_ai_voice: $v('s_ttsAiVoice'),
    gif_enabled: $c('s_gifEnabled'),
    gif_min_amount: +$v('s_gifMin'),
    voice_msg_enabled: $c('s_voiceMsgEnabled'),
    voice_msg_min_amount: +$v('s_voiceMsgMin'),
    voice_msg_max_sec: +$v('s_voiceMsgMax'),
    audio_msg_enabled: $c('s_audioMsgEnabled'),
    audio_msg_min_amount: +$v('s_audioMsgMin'),
    audio_msg_max_sec: +$v('s_audioMsgMax'),
  };
}

// ช่องตัวเลข → ค่าจากเซิร์ฟเวอร์ (เซิร์ฟเวอร์ clamp ค่าให้อยู่ในช่วง เช่น duration 10-60 วิ) ใช้ sync กลับหลังบันทึก
const OVERLAY_NUMBER_FIELDS = {
  s_dur: (s) => Math.round(s.alert_duration_ms / 1000),
  s_minalert: (s) => s.min_alert_amount,
  s_ttsMinAmount: (s) => s.tts_min_amount,
  s_gifMin: (s) => s.gif_min_amount,
  s_voiceMsgMin: (s) => s.voice_msg_min_amount,
  s_voiceMsgMax: (s) => s.voice_msg_max_sec,
  s_audioMsgMin: (s) => s.audio_msg_min_amount,
  s_audioMsgMax: (s) => s.audio_msg_max_sec,
};

let overlaySaveTimer = null;
let overlaySaveChain = Promise.resolve();

function scheduleOverlaySave(delay = 600) {
  clearTimeout(overlaySaveTimer);
  setOverlaySaveStatus('pending');
  overlaySaveTimer = setTimeout(() => {
    overlaySaveTimer = null;
    // ส่งต่อกันทีละคำขอ ป้องกันคำขอเก่ามาถึงทีหลังแล้วทับค่าใหม่
    overlaySaveChain = overlaySaveChain.then(saveOverlaySettings);
  }, delay);
}

async function saveOverlaySettings() {
  setOverlaySaveStatus('saving');
  try {
    const r = await api('/api/streamer/settings', { method: 'PUT', body: collectOverlaySettings() });
    for (const id in OVERLAY_NUMBER_FIELDS) {
      const input = document.getElementById(id);
      if (input !== document.activeElement) input.value = OVERLAY_NUMBER_FIELDS[id](r.settings);
    }
    setOverlaySaveStatus('saved');
  } catch (e) {
    setOverlaySaveStatus('error');
    toast(e.message, false);
  }
}

function setOverlaySaveStatus(state) {
  const box = document.getElementById('ovSaveStatus');
  if (!box) return;
  const label = { pending: 'มีการเปลี่ยนแปลง…', saving: 'กำลังบันทึก…', saved: '✓ บันทึกอัตโนมัติแล้ว', error: '✕ บันทึกไม่สำเร็จ' }[state];
  box.textContent = label;
  box.className = 'autosave-status show ' + state;
  clearTimeout(box._hide);
  if (state === 'saved') box._hide = setTimeout(() => box.classList.remove('show'), 2000);
}

function initOverlayAutoSave() {
  const panel = document.querySelector('[data-panel="overlay"]');
  const isSetting = (t) => t.id && t.id.startsWith('s_') && !t.id.endsWith('Swatch');
  // พิมพ์ข้อความ/ตัวเลข → รอหยุดพิมพ์ก่อนค่อยบันทึก
  panel.addEventListener('input', (e) => {
    if (isSetting(e.target) && (e.target.type === 'number' || e.target.tagName === 'TEXTAREA')) scheduleOverlaySave(800);
  });
  // checkbox / select / ออกจากช่องตัวเลข → บันทึกเกือบทันที
  panel.addEventListener('change', (e) => {
    if (isSetting(e.target)) scheduleOverlaySave(150);
  });
  // ปิดหน้าแล้วยังมีค่าที่ยังไม่ได้ส่ง → ส่งทันที
  window.addEventListener('beforeunload', () => {
    if (!overlaySaveTimer) return;
    fetch('/api/streamer/settings', {
      method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectOverlaySettings()),
    });
  });
}

function updateOverlayPreview() {
  const box = document.getElementById('ovPreview');
  const accent = document.getElementById('s_accent').value || '#ffffff';
  const text = document.getElementById('s_text').value || '#ffffff';
  const connector = document.getElementById('s_connector').value || '#ffffff';
  const showCurrency = document.getElementById('s_showCurrency').checked;
  const template = document.getElementById('s_title').value || '{name} โดเนท {amount}{currency}';

  box.style.setProperty('--ov-accent', accent);
  box.style.setProperty('--ov-text', text);
  box.style.setProperty('--ov-bg', 'transparent');

  // แยกสีคำในหัวข้อตัวอย่างแบบเดียวกับที่ overlay.html จะแสดงจริง: {name}/{amount}/{currency} ใช้สี accent, ตัวหนังสือที่เหลือใช้สี connector
  const titleEl = document.getElementById('ovPreviewTitle');
  titleEl.innerHTML = '';
  const currency = showCurrency ? '฿' : '';
  template.split(/(\{name\}|\{amount\}|\{currency\})/g).filter((x) => x !== '').forEach((part) => {
    const span = document.createElement('span');
    if (part === '{name}') { span.textContent = 'ทดสอบระบบ'; span.style.color = accent; }
    else if (part === '{amount}') { span.textContent = '100'; span.style.color = accent; }
    else if (part === '{currency}') { span.textContent = currency; span.style.color = accent; }
    else { span.textContent = part; span.style.color = connector; }
    titleEl.append(span);
  });
}

// ---------- อัปโหลดเสียง/GIF ของ Overlay ----------
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

function renderUploadPreview(kind, url) {
  if (kind === 'sound') {
    const player = document.getElementById('soundPreview');
    const removeBtn = document.getElementById('removeSound');
    if (url) { player.src = url; player.style.display = ''; removeBtn.style.display = ''; }
    else { player.style.display = 'none'; removeBtn.style.display = 'none'; player.removeAttribute('src'); }
  } else {
    const img = document.getElementById('gifPreview');
    const removeBtn = document.getElementById('removeGif');
    if (url) { img.src = url; img.style.display = ''; removeBtn.style.display = ''; }
    else { img.style.display = 'none'; removeBtn.style.display = 'none'; img.removeAttribute('src'); }
  }
}

function initMediaUploads() {
  document.getElementById('soundInput').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast('ไฟล์ใหญ่เกินไป (สูงสุด 2MB)', false);
    try {
      const dataUrl = await fileToDataUrl(file);
      const r = await api('/api/streamer/overlay/sound', { method: 'POST', body: { sound: dataUrl } });
      renderUploadPreview('sound', r.custom_sound_url);
      toast('อัปโหลดเสียงแล้ว');
    } catch (err) { toast(err.message, false); }
  };
  document.getElementById('removeSound').onclick = async () => {
    try {
      await api('/api/streamer/overlay/sound', { method: 'DELETE' });
      renderUploadPreview('sound', null);
      toast('ลบเสียงแล้ว');
    } catch (err) { toast(err.message, false); }
  };

  document.getElementById('gifInput').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast('ไฟล์ใหญ่เกินไป (สูงสุด 5MB)', false);
    try {
      const dataUrl = await fileToDataUrl(file);
      const r = await api('/api/streamer/overlay/gif', { method: 'POST', body: { gif: dataUrl } });
      renderUploadPreview('gif', r.custom_gif_url);
      toast('อัปโหลด GIF แล้ว');
    } catch (err) { toast(err.message, false); }
  };
  document.getElementById('removeGif').onclick = async () => {
    try {
      await api('/api/streamer/overlay/gif', { method: 'DELETE' });
      renderUploadPreview('gif', null);
      toast('ลบ GIF แล้ว');
    } catch (err) { toast(err.message, false); }
  };
}

// รายชื่อเสียงพากย์จริงขึ้นกับเบราว์เซอร์ที่เปิดหน้านี้ ไม่ใช่เบราว์เซอร์ที่ OBS ใช้รัน Overlay จริง
// จึงเป็นแค่ตัวช่วยเลือก/ฟังตัวอย่างเสียงคร่าว ๆ เท่านั้น ไม่รับประกันว่า OBS จะมีเสียงเดียวกัน
function initTtsVoicePicker(savedVoiceName) {
  const sel = document.getElementById('s_ttsVoice');
  function populate() {
    const voices = ('speechSynthesis' in window) ? speechSynthesis.getVoices() : [];
    sel.innerHTML = '';
    sel.append(el('option', { value: '' }, '— ค่ามาตรฐานของระบบ —'));
    voices.forEach((v) => sel.append(el('option', { value: v.name }, `${v.name} (${v.lang})`)));
    sel.value = savedVoiceName && voices.some((v) => v.name === savedVoiceName) ? savedVoiceName : '';
  }
  populate();
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = populate;
}

// AI เสียงพูด (Google Cloud TTS) — สร้างไฟล์เสียงบนเซิร์ฟเวอร์ จึงได้เสียงเดียวกันทุกเครื่อง ไม่ขึ้นกับเสียงที่ติดตั้งใน OBS
function initAiTts(s, voices, configured) {
  const engine = document.getElementById('s_ttsEngine');
  const voiceSel = document.getElementById('s_ttsAiVoice');
  voices.forEach((v) => voiceSel.append(el('option', { value: v.name }, v.label)));
  engine.value = s.tts_engine === 'ai' ? 'ai' : 'browser';
  voiceSel.value = s.tts_ai_voice || (voices[0] && voices[0].name) || '';

  if (!configured) {
    const note = document.getElementById('aiTtsNote');
    note.innerHTML = '⚠️ ยังไม่ได้ตั้งค่า <code>GOOGLE_TTS_API_KEY</code> ในไฟล์ .env ของเซิร์ฟเวอร์ — ระหว่างนี้ Overlay จะใช้เสียงของเบราว์เซอร์แทน';
    note.style.color = 'var(--err)';
  }

  const sync = () => {
    const ai = engine.value === 'ai';
    document.getElementById('ttsAiBox').hidden = !ai;
    document.getElementById('ttsBrowserBox').hidden = ai;
  };
  engine.addEventListener('change', sync);
  sync();

  let previewAudio = null;
  document.getElementById('previewAiVoice').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const r = await api('/api/streamer/tts/preview', { method: 'POST', body: { voice: voiceSel.value } });
      if (previewAudio) previewAudio.pause();
      previewAudio = new Audio(r.url);
      previewAudio.play().catch(() => {});
    } catch (err) { toast(err.message, false); }
    btn.disabled = false;
  };
}

// ---------- แจ้งเตือนที่กำหนดเองตามจำนวนเงินที่ได้รับ ----------
async function initTiers() {
  document.getElementById('addTier').onclick = async () => {
    try {
      await api('/api/streamer/tiers', { method: 'POST', body: { min_amount: 100, tts_enabled: false, sound_enabled: true, gif_enabled: false } });
      renderTiers();
    } catch (e) { toast(e.message, false); }
  };
  renderTiers();
}

async function renderTiers() {
  const tiers = await api('/api/streamer/tiers').catch(() => []);
  const box = document.getElementById('tierList');
  box.innerHTML = '';
  if (!tiers.length) { box.append(el('div', { class: 'muted' }, 'ยังไม่มีการตั้งค่าแบบกำหนดเอง — ใช้สวิตช์เสียง/TTS/GIF ด้านบนกับทุกโดเนท')); return; }

  tiers.forEach((t) => {
    const row = el('div', { class: 'card', style: 'background:var(--card2);margin-bottom:10px;padding:14px' });
    const amountInput = el('input', { type: 'number', value: t.min_amount, style: 'max-width:120px;display:inline-block' });
    const ttsChk = el('input', { type: 'checkbox', style: 'width:auto' });
    const soundChk = el('input', { type: 'checkbox', style: 'width:auto' });
    const gifChk = el('input', { type: 'checkbox', style: 'width:auto' });
    ttsChk.checked = !!t.tts_enabled; soundChk.checked = !!t.sound_enabled; gifChk.checked = !!t.gif_enabled;

    row.append(el('div', { class: 'row', style: 'align-items:center' },
      el('span', {}, 'ยอดตั้งแต่'), amountInput, el('span', {}, 'บาทขึ้นไป')));
    row.append(el('div', { class: 'row', style: 'margin-top:10px' },
      el('label', { class: 'row', style: 'margin:0' }, ttsChk, ' TTS'),
      el('label', { class: 'row', style: 'margin:0' }, soundChk, ' เสียง'),
      el('label', { class: 'row', style: 'margin:0' }, gifChk, ' GIF')));

    const delBtn = el('button', { class: 'sm ghost', type: 'button', style: 'margin-top:10px' }, 'ลบสิ่งนี้');
    delBtn.onclick = async () => {
      try { await api('/api/streamer/tiers/' + t.id, { method: 'DELETE' }); renderTiers(); }
      catch (e) { toast(e.message, false); }
    };
    row.append(delBtn);

    const saveRow = async () => {
      try {
        // ลบของเดิมแล้วสร้างใหม่ — ง่ายกว่าทำ PUT เฉพาะ endpoint นี้ เพราะไม่มีช่องให้แก้ไขบ่อย
        await api('/api/streamer/tiers/' + t.id, { method: 'DELETE' });
        await api('/api/streamer/tiers', {
          method: 'POST',
          body: { min_amount: +amountInput.value, tts_enabled: ttsChk.checked, sound_enabled: soundChk.checked, gif_enabled: gifChk.checked },
        });
        renderTiers();
        toast('บันทึกแล้ว');
      } catch (e) { toast(e.message, false); }
    };
    [amountInput, ttsChk, soundChk, gifChk].forEach((input) => (input.onchange = saveRow));

    box.append(row);
  });
}

let earnTxAllRows = [];

const PAYOUT_STATUS = { pending: ['รอดำเนินการ', 'wait'], paid: ['โอนแล้ว', 'on'], rejected: ['ปฏิเสธ (คืนยอดแล้ว)', 'off'] };
function payoutStatusBadge(s) {
  const [label, cls] = PAYOUT_STATUS[s] || [s, ''];
  return `<span class="pd-st ${cls}">${esc(label)}</span>`;
}
const EARN_TX_TYPE_LABEL = { donation_received: 'ได้รับโดเนท', withdraw: 'ถอนเงิน', withdraw_refund: 'คืนยอดถอนเงิน (ถูกปฏิเสธ)' };

async function loadStreamerHist() {
  earnTxAllRows = await api('/api/streamer/earnings/history').catch(() => []);
  renderEarnTx();
  document.getElementById('earnTxSearch').oninput = renderEarnTx;
  document.getElementById('earnTxExportExcel').onclick = (e) => { e.preventDefault(); exportEarnTxExcel(); };
  document.getElementById('earnTxExportPdf').onclick = (e) => { e.preventDefault(); exportEarnTxPdf(); };

  const p = await api('/api/streamer/payouts').catch(() => []);
  const byId = Object.fromEntries(p.map((x) => [x.id, x]));
  document.getElementById('payoutHist').innerHTML = p.map((x) => {
    const proof = x.has_slip
      ? `<button type="button" class="sm ghost view-slip" data-id="${x.id}">🧾 ดูสลิป</button>`
      : '';
    const note = x.note ? `<div class="muted" style="margin-top:4px">${esc(x.note)}</div>` : '';
    return `<tr><td>${new Date(x.created_at).toLocaleString('th-TH')}</td><td>${fmt(x.amount)} ฿</td>`
      + `<td>${esc(x.account_detail || '-')}</td><td>${payoutStatusBadge(x.status)}</td><td>${proof || (x.note ? '' : '<span class="muted">-</span>')}${note}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="muted">ไม่มีประวัติการถอนเงิน</td></tr>';
  document.querySelectorAll('#payoutHist .view-slip').forEach((b) => { b.onclick = () => openSlipViewer(byId[b.dataset.id], '/api/streamer/payouts/' + b.dataset.id + '/slip'); });
}

// ค้นได้ทั้งหมายเหตุ ประเภท จำนวนเงิน และวันที่/เวลา (รูปแบบเดียวกับช่องค้นหาอื่นในแดชบอร์ด) — ใช้ทั้งตารางและไฟล์ที่ดาวน์โหลด
function filteredEarnTx() {
  const q = (document.getElementById('earnTxSearch').value || '').trim().toLowerCase();
  return q
    ? earnTxAllRows.filter((d) => [d.note, EARN_TX_TYPE_LABEL[d.type] || d.type, String(d.amount), ...dateSearchTexts(d.created_at)]
      .some((v) => (v || '').toLowerCase().includes(q)))
    : earnTxAllRows;
}
// ยอดในสมุดบัญชีเก็บเป็นค่าบวก/ลบอยู่แล้ว (ถอนเงิน = ติดลบ) — ใส่ + ให้เฉพาะยอดที่เป็นบวก
const signedBaht = (n) => (n > 0 ? '+' : '') + fmt(n) + ' ฿';

function renderEarnTx() {
  const rows = filteredEarnTx();
  document.getElementById('recvHist').innerHTML = rows.map((d) =>
    `<tr><td>${new Date(d.created_at).toLocaleString('th-TH')}</td><td>${esc(EARN_TX_TYPE_LABEL[d.type] || d.type)}</td>`
    + `<td class="${d.amount < 0 ? 'tx-neg' : 'tx-pos'}">${signedBaht(d.amount)}</td><td>${fmt(d.balance_after)} ฿</td><td>${esc(d.note || '')}</td></tr>`
  ).join('') || '<tr><td colspan="5" class="muted">ไม่มีประวัติการทำธุรกรรม</td></tr>';
}

const EARN_TX_HEADER = ['วันที่และเวลา', 'ประเภท', 'จำนวน (บาท)', 'ยอดคงเหลือ (บาท)', 'หมายเหตุ'];
function earnTxRows() {
  return filteredEarnTx().map((d) => [new Date(d.created_at).toLocaleString('th-TH'), EARN_TX_TYPE_LABEL[d.type] || d.type, d.amount, d.balance_after, d.note || '']);
}
function exportEarnTxExcel() { exportCsv('earnings-transactions.csv', EARN_TX_HEADER, earnTxRows()); }
function exportEarnTxPdf() {
  return exportTablePdf('earnings-transactions.pdf', 'การทำธุรกรรม (รายได้)', EARN_TX_HEADER,
    earnTxRows().map((r) => [r[0], r[1], signedBaht(r[2]), fmt(r[3]) + ' ฿', r[4]]));
}

function initEarningsSwitch() {
  const switcher = document.querySelector('.earnings-switch');
  if (!switcher) return;
  const buttons = switcher.querySelectorAll('button');
  buttons.forEach((btn) => {
    btn.onclick = () => {
      buttons.forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.earnings-subpanel').forEach((p) => (p.hidden = p.dataset.etab !== btn.dataset.etab));
    };
  });
  buttons[0].classList.add('active');
}

// ---------- แก้ไขบัญชีรับเงิน (modal) ----------
// ---------- ลิงก์โซเชียลมีเดีย (จัดการบัญชี → โปรไฟล์สาธารณะ) ----------
function initSocialModal() {
  const modal = document.getElementById('socialModal');
  const fields = document.getElementById('socialFields');
  fields.innerHTML = '';
  SOCIAL_PLATFORMS.forEach((p) => {
    const row = el('label', { class: 'social-field' });
    row.append(el('span', { class: 'social-field-ic', html: socialIcon(p.key) }));
    row.append(el('input', {
      id: 'sl_' + p.key, type: 'url', inputmode: 'url', autocomplete: 'off', maxlength: '300',
      placeholder: `เข้าสู่ลิงก์ ${p.label} ที่นี่`,
    }));
    fields.append(row);
  });

  const close = () => { modal.hidden = true; };
  document.getElementById('openSocial').onclick = () => {
    SOCIAL_PLATFORMS.forEach((p) => {
      document.getElementById('sl_' + p.key).value = (ME.social_links || {})[p.key] || '';
    });
    modal.hidden = false;
    document.getElementById('sl_instagram').focus();
  };
  document.getElementById('socialClose').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  document.getElementById('socialDone').onclick = async () => {
    const links = {};
    SOCIAL_PLATFORMS.forEach((p) => { links[p.key] = document.getElementById('sl_' + p.key).value.trim(); });
    const btn = document.getElementById('socialDone');
    btn.disabled = true;
    try {
      const r = await api('/api/me', { method: 'PATCH', body: { social_links: links } });
      ME.social_links = r.social_links || {};
      renderSocialPreview();
      close();
      toast('บันทึกลิงก์โซเชียลมีเดียแล้ว');
    } catch (e) { toast(e.message, false); }
    finally { btn.disabled = false; }
  };
  renderSocialPreview();
}

function renderSocialPreview() {
  const box = document.getElementById('socialPreview');
  box.innerHTML = '';
  const row = socialLinksRow(ME.social_links);
  if (row) box.append(...row.childNodes);
  else box.append(el('span', { class: 'muted' }, 'ยังไม่ได้เพิ่มลิงก์'));
}

// ---------- ถอนเงิน: เลือกช่องทาง (51.png) → ตรวจสอบข้อมูล → ตกลง ----------
const WD = { accounts: {}, banks: [], methods: {}, selected: null, amount: 0 };
const WD_HINT = {
  bank: 'กรอกเลขบัญชีธนาคาร 10-15 หลัก (ไม่รับบัญชีเสมือน)',
  promptpay: 'เบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลักที่ผูกพร้อมเพย์',
  truemoney: 'เบอร์มือถือ 10 หลักที่ใช้สมัคร TrueMoney Wallet',
};
const money = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function wdSummary(method, a) {
  if (!a) return '';
  const who = a.first_name + ' ' + a.last_name;
  return (method === 'bank' ? a.bank + ' • ' : '') + a.number + ' • ' + who;
}

async function initWithdraw() {
  const d = await api('/api/streamer/payout-accounts').catch(() => null);
  if (d) Object.assign(WD, { accounts: d.accounts || {}, banks: d.banks || [], methods: d.methods || {} });
  const sel = document.getElementById('accBank');
  WD.banks.forEach((b) => sel.append(el('option', { value: b }, b)));

  document.getElementById('pGo').onclick = () => {
    const amount = Math.floor(+document.getElementById('pAmount').value);
    if (!(amount >= 100)) return toast('ถอนขั้นต่ำ 100 บาท', false);
    if (amount > (ME.earnings_balance || 0)) return toast('ยอดรายได้คงเหลือไม่พอ', false);
    WD.amount = amount;
    document.getElementById('wdBal').textContent = money(ME.earnings_balance);
    document.getElementById('wdAmt').textContent = money(amount);
    if (!WD.selected) WD.selected = Object.keys(WD.methods).find((m) => WD.accounts[m]) || 'bank';
    renderWdMethods();
    showWdStep(1);
    document.getElementById('wdModal').hidden = false;
  };

  const closeWd = () => { document.getElementById('wdModal').hidden = true; };
  const closeAcc = () => { document.getElementById('accModal').hidden = true; };
  document.getElementById('wdClose').onclick = closeWd;
  document.getElementById('accClose').onclick = closeAcc;
  document.getElementById('wdModal').onclick = (e) => { if (e.target.id === 'wdModal') closeWd(); };
  document.getElementById('accModal').onclick = (e) => { if (e.target.id === 'accModal') closeAcc(); };
  document.getElementById('wdBack').onclick = () => showWdStep(1);
  document.getElementById('wdNext').onclick = () => {
    const m = WD.selected;
    if (!m || !WD.accounts[m]) return toast(`กรุณากด "Edit" เพื่อกรอกข้อมูล${m ? WD.methods[m].label : 'ช่องทางรับเงิน'}ก่อน`, false);
    renderWdReview();
    showWdStep(2);
  };
  document.getElementById('wdConfirm').onclick = submitWithdraw;
  document.getElementById('accSave').onclick = saveAccount;
}

function showWdStep(n) {
  document.getElementById('wdStep1').hidden = n !== 1;
  document.getElementById('wdStep2').hidden = n !== 2;
}

function renderWdMethods() {
  const box = document.getElementById('wdMethods');
  box.innerHTML = '';
  Object.entries(WD.methods).forEach(([key, m]) => {
    const acc = WD.accounts[key];
    const row = el('label', { class: 'wd-method' + (WD.selected === key ? ' on' : '') });
    const radio = el('input', { type: 'radio', name: 'wdMethod', value: key });
    radio.checked = WD.selected === key;
    radio.onchange = () => { WD.selected = key; renderWdMethods(); };
    const edit = el('button', { type: 'button', class: 'wd-edit' }, 'Edit');
    edit.onclick = (e) => { e.preventDefault(); openAccModal(key); };
    row.append(radio, el('span', { class: 'wd-mtxt' },
      el('span', { class: 'wd-mname' }, m.label.toUpperCase(), edit),
      el('span', { class: 'wd-mhint' + (acc ? ' filled' : '') }, acc ? wdSummary(key, acc) : 'คลิก "Edit" เพื่อกรอกข้อมูล')));
    box.append(row);
  });
}

function renderWdReview() {
  const m = WD.selected, a = WD.accounts[m], meta = WD.methods[m];
  const rows = [
    ['จำนวนเงินที่ถอน', `<b class="wd-big">${money(WD.amount)}</b>`],
    ['ถอนไปยัง', esc(meta.label)],
    ...(m === 'bank' ? [['ธนาคาร', esc(a.bank)]] : []),
    [meta.numberLabel, `<b>${esc(a.number)}</b>`],
    ['ชื่อผู้รับ', `<b>${esc(a.first_name + ' ' + a.last_name)}</b>`],
    ['รายได้คงเหลือหลังถอน', money((ME.earnings_balance || 0) - WD.amount)],
  ];
  document.getElementById('wdReview').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('');
}

function openAccModal(method) {
  const m = WD.methods[method], a = WD.accounts[method] || {};
  WD.editing = method;
  document.getElementById('accTitle').textContent = 'ข้อมูลรับเงิน: ' + m.label;
  document.getElementById('accBankRow').hidden = method !== 'bank';
  document.getElementById('accBank').value = a.bank || '';
  document.getElementById('accNumLabel').textContent = m.numberLabel;
  document.getElementById('accNumber').value = a.number || '';
  document.getElementById('accNumber').placeholder = m.numberLabel;
  document.getElementById('accNumHint').textContent = WD_HINT[method] || '';
  document.getElementById('accFirst').value = a.first_name || '';
  document.getElementById('accLast').value = a.last_name || '';
  document.getElementById('accModal').hidden = false;
}

async function saveAccount() {
  const method = WD.editing;
  const btn = document.getElementById('accSave');
  btn.disabled = true;
  try {
    const r = await api('/api/streamer/payout-accounts/' + method, {
      method: 'PUT',
      body: {
        bank: document.getElementById('accBank').value,
        number: document.getElementById('accNumber').value,
        first_name: document.getElementById('accFirst').value,
        last_name: document.getElementById('accLast').value,
      },
    });
    WD.accounts = r.accounts;
    WD.selected = method;
    renderWdMethods();
    document.getElementById('accModal').hidden = true;
    toast('บันทึกข้อมูลรับเงินแล้ว');
  } catch (e) { toast(e.message, false); }
  btn.disabled = false;
}

async function submitWithdraw() {
  const btn = document.getElementById('wdConfirm');
  btn.disabled = true;
  try {
    await api('/api/streamer/payout', { method: 'POST', body: { amount: WD.amount, method: WD.selected } });
    document.getElementById('wdModal').hidden = true;
    document.getElementById('pAmount').value = '';
    playUiSound('success');
    if (window.Swal) Swal.fire({ icon: 'success', title: 'ส่งคำขอถอนเงินแล้ว', html: `ถอน <b>${money(WD.amount)}</b> ไปยัง ${esc(WD.methods[WD.selected].label)}<br>สถานะ: รอดำเนินการ — ทีมงานจะโอนให้ภายในเวลาทำการ`, confirmButtonText: 'ตกลง' });
    else toast('ส่งคำขอถอนเงินแล้ว');
    refreshBalance();
    loadStreamerHist();
  } catch (e) { toast(e.message, false); }
  btn.disabled = false;
}

// ---------- สถิติ / อันดับผู้โดเนท ----------
let analyticsCache = null, currentMetric = 'revenue', currentDays = 14;

async function initStats() {
  document.getElementById('metricSeg').querySelectorAll('button').forEach((b) => {
    b.onclick = () => { currentMetric = b.dataset.metric; setActiveSeg('metricSeg', b); renderAll(); };
  });
  document.getElementById('rangeSeg').querySelectorAll('button').forEach((b) => {
    b.onclick = async () => { currentDays = Number(b.dataset.days); setActiveSeg('rangeSeg', b); await loadAnalytics(); renderAll(); };
  });
  document.getElementById('toggleTrendTable').onclick = () => {
    const wrap = document.getElementById('trendTableWrap');
    wrap.hidden = !wrap.hidden;
  };
  await loadAnalytics();
  renderAll();
}

function setActiveSeg(segId, btn) {
  document.getElementById(segId).querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
}

async function loadAnalytics() {
  analyticsCache = await api('/api/streamer/analytics?days=' + currentDays).catch(() => null);
}

function renderAll() {
  if (!analyticsCache) return;
  renderStatTiles(analyticsCache.totals);
  renderChart(analyticsCache.trend, currentMetric);
  renderTrendTable(analyticsCache.trend);
}

function renderStatTiles(t) {
  // ผู้เยี่ยมชม: ระบบนี้ยังไม่มีการแยกแยะผู้เข้าชมแต่ละคน (ไม่มี session/visitor id) จึงใช้ตัวเลขเดียวกับ "การเข้าชม"
  const tiles = [
    { label: 'รายได้', value: 'THB' + fmt(t.revenue_period) },
    { label: 'ธุรกรรม', value: fmt(t.donations_period) },
    { label: 'ผู้สนับสนุน', value: fmt(t.supporters_period) },
    { label: 'การเข้าชม', value: fmt(t.views_period) },
    { label: 'ผู้เยี่ยมชม', value: fmt(t.views_period) },
    { label: 'มูลค่าธุรกรรมเฉลี่ย', value: 'THB' + fmt(t.avg_period) },
  ];
  const box = document.getElementById('statTiles');
  box.innerHTML = '';
  tiles.forEach((x) => {
    box.append(el('div', { class: 'stat-tile' }, el('div', { class: 'label' }, x.label), el('div', { class: 'value' }, x.value)));
  });
}

// ---------- ข้อมูลผู้สนับสนุน: ค้นหา / เรียงลำดับ / export (ไม่ขึ้นกับช่วงวันที่ของ Analytics — แสดงทั้งหมดตลอดกาล) ----------
let suppAllRows = [];
let suppSort = { key: 'total', dir: 'desc' };

async function loadSupporters() {
  suppAllRows = await api('/api/streamer/supporters').catch(() => []);
  initSuppControls();
  renderSuppTable();
}

function initSuppControls() {
  document.getElementById('suppSearch').oninput = renderSuppTable;
  document.querySelectorAll('[data-panel="leaderboard"] th.sortable').forEach((th) => {
    th.onclick = () => {
      const key = th.dataset.sort;
      suppSort = { key, dir: suppSort.key === key && suppSort.dir === 'asc' ? 'desc' : 'asc' };
      renderSuppTable();
    };
  });
  document.getElementById('suppExportExcel').onclick = (e) => { e.preventDefault(); exportSuppExcel(); };
  document.getElementById('suppExportPdf').onclick = (e) => { e.preventDefault(); exportSuppPdf(); };
}

function getFilteredSortedSupp() {
  const q = (document.getElementById('suppSearch').value || '').trim().toLowerCase();
  let rows = q ? suppAllRows.filter((d) => (d.display_name || '').toLowerCase().includes(q)) : suppAllRows.slice();
  const { key, dir } = suppSort;
  rows.sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === 'display_name') { av = (av || '').toLowerCase(); bv = (bv || '').toLowerCase(); }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
  return rows;
}

function renderSuppTable() {
  const rows = getFilteredSortedSupp();
  document.querySelectorAll('[data-panel="leaderboard"] th.sortable').forEach((th) => {
    th.classList.toggle('sort-asc', th.dataset.sort === suppSort.key && suppSort.dir === 'asc');
    th.classList.toggle('sort-desc', th.dataset.sort === suppSort.key && suppSort.dir === 'desc');
  });
  document.getElementById('donorRank').innerHTML = rows.map((d) => `<tr>
      <td>${esc(d.display_name || '-')}${d.username ? ' <span class="muted">@' + esc(d.username) + '</span>' : ''}</td>
      <td>${fmt(d.count)}</td>
      <td>${fmt(d.total)} ฿</td>
      <td>${esc(d.email || '-')}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="muted">ว่างเปล่า</td></tr>';
}

const SUPP_HEADER = ['ชื่อ', 'ธุรกรรม', 'จำนวนเงินทั้งหมด', 'อีเมล'];
function exportSuppExcel() {
  exportCsv('supporters.csv', SUPP_HEADER,
    getFilteredSortedSupp().map((d) => [d.display_name || '', d.count, d.total, d.email || '']));
}
function exportSuppPdf() {
  return exportTablePdf('supporters.pdf', 'ข้อมูลผู้สนับสนุน', SUPP_HEADER,
    getFilteredSortedSupp().map((d) => [
      (d.display_name || '-') + (d.username ? ' (@' + d.username + ')' : ''), fmt(d.count), fmt(d.total) + ' ฿', d.email || '-',
    ]));
}

function renderTrendTable(trend) {
  document.getElementById('trendTableBody').innerHTML = trend.map((t) =>
    `<tr><td>${esc(t.date)}</td><td>${fmt(t.revenue)} ฿</td><td>${fmt(t.donations)}</td><td>${fmt(t.views)}</td></tr>`
  ).join('');
}

function niceMax(v) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  let nice;
  if (norm <= 1) nice = 1; else if (norm <= 2) nice = 2; else if (norm <= 5) nice = 5; else nice = 10;
  return nice * mag;
}

function metricLabel(metric) {
  return metric === 'revenue' ? 'รายได้' : metric === 'donations' ? 'จำนวนโดเนท' : 'ผู้เข้าชม';
}
function fmtMetricValue(metric, v) { return metric === 'revenue' ? fmt(v) + ' ฿' : fmt(v); }

function renderChart(trend, metric) {
  const wrap = document.getElementById('trendChart');
  wrap.innerHTML = '';
  const W = 640, H = 200, padL = 44, padR = 10, padT = 16, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = trend.length;
  if (!n) return;

  const values = trend.map((t) => t[metric]);
  const yMax = niceMax(Math.max(...values, 0));
  const stepX = n > 1 ? plotW / (n - 1) : 0;
  const xAt = (i) => padL + stepX * i;
  const yAt = (v) => padT + plotH - (v / yMax) * plotH;
  const points = trend.map((t, i) => ({ x: xAt(i), y: yAt(t[metric]), t }));

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  [0, 0.5, 1].forEach((f) => {
    const y = padT + plotH * (1 - f);
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', padL); line.setAttribute('x2', W - padR);
    line.setAttribute('y1', y); line.setAttribute('y2', y);
    line.style.stroke = 'var(--line)'; line.setAttribute('stroke-width', '1');
    svg.append(line);
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', padL - 6); label.setAttribute('y', y + 4);
    label.setAttribute('text-anchor', 'end'); label.setAttribute('font-size', '10');
    label.style.fill = 'var(--muted)';
    label.textContent = fmt(Math.round(yMax * f));
    svg.append(label);
  });

  const labelEvery = n <= 7 ? 1 : n <= 14 ? 2 : 5;
  trend.forEach((t, i) => {
    if (i % labelEvery !== 0 && i !== n - 1) return;
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', xAt(i)); label.setAttribute('y', H - 6);
    label.setAttribute('text-anchor', 'middle'); label.setAttribute('font-size', '10');
    label.style.fill = 'var(--muted)';
    const dt = new Date(t.date + 'T00:00:00');
    label.textContent = dt.getDate() + '/' + (dt.getMonth() + 1);
    svg.append(label);
  });

  const base = padT + plotH;
  let areaD = `M ${points[0].x},${base} `;
  points.forEach((p) => { areaD += `L ${p.x},${p.y} `; });
  areaD += `L ${points[n - 1].x},${base} Z`;
  const area = document.createElementNS(svgNS, 'path');
  area.setAttribute('d', areaD);
  area.style.fill = 'var(--text)'; area.style.fillOpacity = '.08';
  svg.append(area);

  let lineD = `M ${points[0].x},${points[0].y} `;
  points.slice(1).forEach((p) => { lineD += `L ${p.x},${p.y} `; });
  const line = document.createElementNS(svgNS, 'path');
  line.setAttribute('d', lineD);
  line.setAttribute('fill', 'none');
  line.style.stroke = 'var(--text)';
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-linejoin', 'round');
  line.setAttribute('stroke-linecap', 'round');
  svg.append(line);

  const last = points[n - 1];
  const dot = document.createElementNS(svgNS, 'circle');
  dot.setAttribute('cx', last.x); dot.setAttribute('cy', last.y); dot.setAttribute('r', 5);
  dot.style.fill = 'var(--text)'; dot.style.stroke = 'var(--card)'; dot.setAttribute('stroke-width', '2');
  svg.append(dot);

  const endLabel = document.createElementNS(svgNS, 'text');
  const above = last.y > padT + 16;
  endLabel.setAttribute('x', last.x); endLabel.setAttribute('y', above ? last.y - 10 : last.y + 18);
  endLabel.setAttribute('text-anchor', last.x > W - 60 ? 'end' : 'middle');
  endLabel.setAttribute('font-size', '12'); endLabel.setAttribute('font-weight', '700');
  endLabel.style.fill = 'var(--text)';
  endLabel.textContent = fmtMetricValue(metric, last.t[metric]);
  svg.append(endLabel);

  const crosshair = document.createElementNS(svgNS, 'line');
  crosshair.setAttribute('y1', padT); crosshair.setAttribute('y2', padT + plotH);
  crosshair.style.stroke = 'var(--muted)'; crosshair.setAttribute('stroke-width', '1');
  crosshair.setAttribute('opacity', '0');
  svg.append(crosshair);

  const hoverDot = document.createElementNS(svgNS, 'circle');
  hoverDot.setAttribute('r', 5); hoverDot.style.fill = 'var(--text)';
  hoverDot.style.stroke = 'var(--card)'; hoverDot.setAttribute('stroke-width', '2');
  hoverDot.setAttribute('opacity', '0');
  svg.append(hoverDot);

  const overlay = document.createElementNS(svgNS, 'rect');
  overlay.setAttribute('x', padL); overlay.setAttribute('y', 0);
  overlay.setAttribute('width', plotW); overlay.setAttribute('height', H);
  overlay.setAttribute('fill', 'transparent');
  svg.append(overlay);

  const tooltip = el('div', { class: 'chart-tooltip' });
  wrap.append(svg, tooltip);

  function showAt(i) {
    const p = points[i];
    crosshair.setAttribute('x1', p.x); crosshair.setAttribute('x2', p.x); crosshair.setAttribute('opacity', '1');
    hoverDot.setAttribute('cx', p.x); hoverDot.setAttribute('cy', p.y); hoverDot.setAttribute('opacity', '1');
    const rect = wrap.getBoundingClientRect();
    const scale = rect.width / W;
    tooltip.style.left = (p.x * scale) + 'px';
    tooltip.style.top = (p.y * scale) + 'px';
    tooltip.style.opacity = '1';
    const dt = new Date(p.t.date + 'T00:00:00');
    tooltip.innerHTML = `<div class="d">${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear() + 543}</div>`
      + `<div class="v">${esc(metricLabel(metric))}: ${esc(fmtMetricValue(metric, p.t[metric]))}</div>`;
  }
  function hide() {
    crosshair.setAttribute('opacity', '0');
    hoverDot.setAttribute('opacity', '0');
    tooltip.style.opacity = '0';
  }
  overlay.addEventListener('pointermove', (ev) => {
    const rect = wrap.getBoundingClientRect();
    const scale = rect.width / W;
    const svgX = (ev.clientX - rect.left) / scale;
    let i = Math.round((svgX - padL) / (stepX || 1));
    i = Math.max(0, Math.min(n - 1, i));
    showAt(i);
  });
  overlay.addEventListener('pointerleave', hide);
}

let THAI_ADDR_FLAT = null;
async function loadThaiAddrFlat() {
  if (THAI_ADDR_FLAT) return THAI_ADDR_FLAT;
  const geo = await fetch('/data/thai-geo.json').then((r) => r.json());
  const flat = [];
  geo.forEach((p) => p.districts.forEach((d) => d.subdistricts.forEach((s) => {
    flat.push({ subdistrict: s.name, district: d.name, province: p.name, zip: String(s.zip) });
  })));
  THAI_ADDR_FLAT = flat;
  return flat;
}

function addrLabel(item) {
  return item.subdistrict + ' ' + item.district + ' - ' + item.province + ' - ' + item.zip;
}

async function initAddressPicker() {
  const flat = await loadThaiAddrFlat();
  const input = document.getElementById('p_addrSearch');
  const box = document.getElementById('p_addrSuggest');
  const provInp = document.getElementById('p_province');
  const distInp = document.getElementById('p_district');
  const subInp = document.getElementById('p_subdistrict');
  const zipInp = document.getElementById('p_zip');

  function pick(item) {
    provInp.value = item.province;
    distInp.value = item.district;
    subInp.value = item.subdistrict;
    zipInp.value = item.zip;
    input.value = addrLabel(item);
    box.hidden = true;
  }

  function search(q) {
    box.innerHTML = '';
    if (!q) { box.hidden = true; return; }
    const needle = q.trim().toLowerCase();
    const matches = flat.filter((it) =>
      it.subdistrict.toLowerCase().includes(needle) ||
      it.district.toLowerCase().includes(needle) ||
      it.province.toLowerCase().includes(needle) ||
      it.zip.includes(needle)
    ).slice(0, 30);
    if (!matches.length) {
      box.append(el('div', { class: 'empty' }, 'ไม่พบที่อยู่ที่ตรงกัน'));
    } else {
      matches.forEach((it) => {
        const opt = el('div', { class: 'opt' }, addrLabel(it));
        opt.onmousedown = (e) => { e.preventDefault(); pick(it); };
        box.append(opt);
      });
    }
    box.hidden = false;
  }

  input.oninput = () => search(input.value);
  input.onfocus = () => { if (input.value) search(input.value); };
  document.addEventListener('click', (e) => {
    if (e.target !== input) box.hidden = true;
  });
}
