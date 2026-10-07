// ---------- แผงควบคุมแอดมิน: เมนูด้านข้าง + แท็บ (ภาพรวม / ผู้ใช้ / โดเนท / ชำระค่าแพลน / สติกเกอร์ / ตั้งค่า) ----------
const ADM = {
  users: [], userFilter: 'all',
  donations: [], planOrders: [], tpFilter: 'all',
  stickers: [],
};
const STICKER_ANIMS = [
  ['float', 'ลอยขึ้น'], ['rain', 'ตกลงมา'], ['bounce', 'เด้ง'], ['zoom', 'ซูม'],
  ['spin', 'หมุน'], ['fly', 'บินข้าม'], ['shake', 'สั่น'], ['petals', 'กลีบดอกไม้โปรย'],
];
const ROLE_LABEL = { admin: 'แอดมิน', streamer: 'สตรีมเมอร์', donor: 'ผู้โดเนท' };
const PL_STATUS = { paid: ['สำเร็จ', 'on'], pending: ['รอชำระ', 'wait'], review: ['รอตรวจสลิป', 'wait'], rejected: ['ปฏิเสธ', 'off'] };
const baht = (n) => Number(n || 0).toLocaleString('th-TH') + ' ฿';
const dtShort = (ts) => new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });

(async function () {
  const me = await getMe();
  if (!me) { location.href = '/login.html'; return; }
  if (me.role !== 'admin') {
    document.body.innerHTML = '<div class="container"><div class="card">หน้านี้สำหรับแอดมินเท่านั้น</div></div>';
    return;
  }
  mountNav(me);
  document.getElementById('admToday').textContent = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  initTabs();
  initUsers();
  initLists();
  initStickers();
  initSettings();
  initSupport({ admin: true });
  document.getElementById('admRefresh').onclick = () => { loadAll(); toast('รีเฟรชข้อมูลแล้ว'); };
  // มีสลิปค่าแพลนใหม่รอตรวจ → อัปเดตตาราง + ตัวเลขบนเมนูทันที
  onAppSocket((socket) => socket.on('planorder:review', () => { loadLists(); loadStats(); }));
  loadAll();
})();

function loadAll() {
  loadStats(); loadUsers(); loadLists(); loadStickers(); loadConfig();
}

// ---------- แท็บ (จำแท็บไว้ใน #hash) ----------
function initTabs() {
  document.querySelectorAll('#admNav [data-atab]').forEach((b) => { b.onclick = () => switchAdmTab(b.dataset.atab); });
  document.querySelectorAll('[data-goto]').forEach((b) => { b.onclick = () => switchAdmTab(b.dataset.goto); });
  window.addEventListener('hashchange', () => switchAdmTab(location.hash.slice(1)));
  switchAdmTab(location.hash.slice(1));
}

function switchAdmTab(tab) {
  const requested = tab;
  // #support/<id> = เปิดแชทเรื่องนั้น (support.js จัดการต่อเอง)
  const supportLink = /^support\/\d+$/.test(tab || '');
  if (supportLink) tab = 'support';
  const panels = [...document.querySelectorAll('.adm-panel')];
  if (!panels.some((p) => p.dataset.apanel === tab)) tab = 'overview';
  panels.forEach((p) => { p.hidden = p.dataset.apanel !== tab; });
  document.querySelectorAll('#admNav [data-atab]').forEach((b) => b.classList.toggle('active', b.dataset.atab === tab));
  const hash = supportLink ? requested : tab;
  if (location.hash.slice(1) !== hash) history.replaceState(null, '', '#' + hash);
}

function setChips(boxId, value) {
  document.querySelectorAll('#' + boxId + ' button').forEach((b) => b.classList.toggle('active', b.dataset.f === value));
}

// ค้นหาวันที่ได้หลายรูปแบบ (พ.ศ./ค.ศ./ชื่อเดือน) แบบเดียวกับหน้าแดชบอร์ด
function dateTexts(ts) {
  const d = new Date(ts), p2 = (n) => String(n).padStart(2, '0');
  const D = d.getDate(), M = d.getMonth() + 1, Y = d.getFullYear();
  return [d.toLocaleString('th-TH'), `${D}/${M}/${Y}`, `${p2(D)}/${p2(M)}/${Y + 543}`, `${Y}-${p2(M)}-${p2(D)}`,
    d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }),
    d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })];
}
const matches = (q, fields) => !q || fields.some((v) => String(v || '').toLowerCase().includes(q));

// ---------- ภาพรวม ----------
async function loadStats() {
  const s = await api('/api/admin/stats').catch(() => null);
  if (!s) return;
  const rm = Object.fromEntries(s.users.map((r) => [r.role, r.c]));
  const totalUsers = s.users.reduce((a, r) => a + r.c, 0);
  const kpi = (icon, tone, label, value, sub, goto) => `
    <div class="adm-kpi${goto ? ' link' : ''}" ${goto ? `data-goto="${goto}"` : ''}>
      <span class="adm-kpi-ic ${tone}">${icon}</span>
      <div class="adm-kpi-label">${label}</div>
      <div class="adm-kpi-value">${value}</div>
      <div class="adm-kpi-sub">${sub}</div>
    </div>`;
  document.getElementById('kpis').innerHTML = [
    kpi('👥', 'blue', 'ผู้ใช้ทั้งหมด', fmt(totalUsers), `+${fmt(s.new_users_7d)} ใน 7 วัน · สตรีมเมอร์ ${fmt(rm.streamer || 0)}`, 'users'),
    kpi('💸', 'green', 'โดเนทวันนี้', baht(s.today.donation_value), `${fmt(s.today.donations)} รายการ · รวมทั้งหมด ${baht(s.donations.v)}`, 'donations'),
    kpi('📈', 'violet', 'รายได้ค่าแพลน', baht(s.plan_revenue), `วันนี้ ${baht(s.today.plan_revenue)} · ${fmt(s.plan_orders_paid)} รายการ`, 'planorders'),
    kpi('🧾', s.plan_review ? 'orange' : 'gray', 'สลิปค่าแพลนรอตรวจ', fmt(s.plan_review) + ' รายการ', 'สลิปที่ระบบตรวจอัตโนมัติไม่ผ่าน', 'planorders'),
    kpi('🎁', 'pink', 'โดเนททั้งหมด', fmt(s.donations.c) + ' รายการ', `มูลค่า ${baht(s.donations.v)}`, 'donations'),
  ].join('');
  document.querySelectorAll('#kpis [data-goto]').forEach((b) => { b.onclick = () => switchAdmTab(b.dataset.goto); });

  const badge = document.getElementById('navPlanBadge');
  badge.hidden = !s.plan_review;
  badge.textContent = s.plan_review;
  renderChart(s.series);
}

function renderChart(series) {
  const max = Math.max(1, ...series.map((d) => d.v));
  const total = series.reduce((a, d) => a + d.v, 0);
  document.getElementById('chartSub').textContent = `รวม ${baht(total)} · ${fmt(series.reduce((a, d) => a + d.c, 0))} รายการ`;
  document.getElementById('admChart').innerHTML = series.map((d, i) => {
    const h = Math.max(2, Math.round((d.v / max) * 100));
    const day = new Date(d.day);
    const isToday = i === series.length - 1;
    return `<div class="adm-bar${isToday ? ' today' : ''}" title="${day.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}: ${baht(d.v)} (${d.c} รายการ)">
        <span class="adm-bar-val">${d.v ? fmt(d.v) : ''}</span>
        <span class="adm-bar-fill" style="height:${h}%"></span>
        <span class="adm-bar-day">${day.getDate()}</span>
      </div>`;
  }).join('');
}

function renderOverviewLists() {
  const recent = ADM.planOrders.filter((o) => o.status === 'paid' || o.status === 'review').slice(0, 5);
  document.getElementById('ovPlanOrders').innerHTML = recent.map((o) => `
    <div class="adm-li"><span class="adm-li-ic">${o.status === 'review' ? '🧾' : '💳'}</span>
      <div class="adm-li-txt"><b>@${esc(o.username)}</b><span class="muted">${esc(o.plan_label)}${o.status === 'review' ? ' · รอตรวจสลิป' : ''}</span></div>
      <div class="adm-li-end"><b>${baht(o.price)}</b><span class="muted">${dtShort(o.created_at)}</span></div></div>`).join('')
    || '<div class="adm-empty">ยังไม่มีการชำระค่าแพลน</div>';
  document.getElementById('ovDonations').innerHTML = ADM.donations.slice(0, 5).map((d) => `
    <div class="adm-li"><span class="adm-li-ic">💸</span>
      <div class="adm-li-txt"><b>${esc(d.display_name || d.donor_username)} → @${esc(d.streamer_username)}</b><span class="muted">${esc(d.message || '—')}</span></div>
      <div class="adm-li-end"><b>${baht(d.total_cost ?? d.amount)}</b><span class="muted">${dtShort(d.created_at)}</span></div></div>`).join('')
    || '<div class="adm-empty">ยังไม่มีโดเนท</div>';
}

// ---------- ผู้ใช้งาน ----------
function initUsers() {
  let t = null;
  document.getElementById('q').oninput = () => { clearTimeout(t); t = setTimeout(renderUsers, 150); };
  document.querySelectorAll('#roleFilter button').forEach((b) => {
    b.onclick = () => { ADM.userFilter = b.dataset.f; setChips('roleFilter', b.dataset.f); renderUsers(); };
  });
  initUserModal();
}

async function loadUsers() {
  ADM.users = await api('/api/admin/users?q=').catch(() => []);
  renderUsers();
}

function avatarHtml(u, cls = 'adm-av') {
  return u.avatar_url
    ? `<img class="${cls}" src="${esc(u.avatar_url)}" alt="">`
    : `<span class="${cls} fb">${esc((u.display_name || u.username || '?').trim().charAt(0).toUpperCase())}</span>`;
}

function renderUsers() {
  const q = document.getElementById('q').value.trim().toLowerCase().replace(/^@/, '');
  const f = ADM.userFilter;
  const list = ADM.users.filter((u) => (f === 'all' || (f === 'banned' ? u.banned : u.role === f))
    && matches(q, [u.username, u.email, u.display_name]));
  document.getElementById('usersCount').textContent = `แสดง ${fmt(list.length)} จาก ${fmt(ADM.users.length)} บัญชี`;
  document.getElementById('users').innerHTML = list.map((u) => `
    <tr data-id="${u.id}">
      <td><div class="adm-user">${avatarHtml(u)}<div><b>${esc(u.display_name || u.username)}</b><span class="muted">@${esc(u.username)} · ${esc(u.email || '-')}</span></div></div></td>
      <td><span class="adm-role ${u.role}">${ROLE_LABEL[u.role] || u.role}</span></td>
      <td class="muted">${planUntil(u)}</td>
      <td class="adm-wrap">${u.banned ? '<span class="pd-st off">ระงับ</span>' : '<span class="pd-st on">ปกติ</span>'}${u.email_verified ? '' : ' <span class="pd-st wait">ยังไม่ยืนยันอีเมล</span>'}</td>
      <td class="muted">${new Date(u.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
      <td><button type="button" class="sm ghost manage">จัดการ</button></td>
    </tr>`).join('') || '<tr><td colspan="6" class="adm-empty">ไม่พบผู้ใช้</td></tr>';
  document.querySelectorAll('#users tr[data-id] .manage').forEach((b) => {
    b.onclick = () => openUserModal(Number(b.closest('tr').dataset.id));
  });
}

let umUser = null;
function initUserModal() {
  const modal = document.getElementById('userModal');
  const close = () => { modal.hidden = true; };
  document.getElementById('umClose').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  document.querySelectorAll('#umRole button').forEach((b) => {
    b.onclick = async () => {
      const role = b.dataset.r;
      if (role === umUser.role) return;
      if (!(await confirmDialog(`เปลี่ยนบทบาทเป็น "${ROLE_LABEL[role]}"?`, `@${umUser.username}`, { confirmText: 'เปลี่ยนบทบาท', danger: role === 'admin' }))) return;
      try {
        await api('/api/admin/users/' + umUser.id, { method: 'PATCH', body: { role } });
        toast('เปลี่ยนบทบาทแล้ว');
        await refreshUser();
      } catch (e) { toast(e.message, false); }
    };
  });
  document.getElementById('umPw').onclick = async () => {
    const p = await promptDialog('ตั้งรหัสผ่านใหม่ให้ @' + umUser.username, {
      input: 'password', placeholder: 'อย่างน้อย 6 ตัว',
      validate: (v) => (!v || v.length < 6) && 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว',
    });
    if (!p) return;
    try { await api('/api/admin/users/' + umUser.id + '/reset-password', { method: 'POST', body: { password: p } }); toast('รีเซ็ตรหัสผ่านแล้ว'); }
    catch (e) { toast(e.message, false); }
  };
  document.getElementById('umBan').onclick = async () => {
    const banned = !!umUser.banned;
    if (!banned && !(await confirmDialog('ระงับผู้ใช้นี้?', `@${umUser.username} จะเข้าใช้งานไม่ได้จนกว่าจะปลดระงับ`, { confirmText: 'ระงับ', danger: true }))) return;
    try {
      await api('/api/admin/users/' + umUser.id, { method: 'PATCH', body: { banned: !banned } });
      toast(banned ? 'ปลดระงับแล้ว' : 'ระงับผู้ใช้แล้ว');
      await refreshUser();
    } catch (e) { toast(e.message, false); }
  };
}

async function refreshUser() {
  await loadUsers();
  loadStats();
  const u = ADM.users.find((x) => x.id === umUser.id);
  if (u) openUserModal(u.id);
}

function openUserModal(id) {
  const u = ADM.users.find((x) => x.id === id);
  if (!u) return;
  umUser = u;
  document.getElementById('umAvatar').innerHTML = avatarHtml(u, 'adm-av lg');
  document.getElementById('umName').textContent = u.display_name || u.username;
  document.getElementById('umSub').textContent = `@${u.username} · ${u.email || '-'} · ID ${u.id}`;
  document.getElementById('umPlan').textContent = planUntil(u);
  document.querySelectorAll('#umRole button').forEach((b) => b.classList.toggle('active', b.dataset.r === u.role));
  const ban = document.getElementById('umBan');
  ban.textContent = u.banned ? '✅ ปลดระงับผู้ใช้' : '⛔ ระงับผู้ใช้';
  ban.classList.toggle('adm-danger', !u.banned);
  document.getElementById('userModal').hidden = false;
}

// ---------- โดเนท / ชำระค่าแพลน ----------
function initLists() {
  document.getElementById('donQ').oninput = renderDonations;
  document.getElementById('tpQ').oninput = renderPlanOrders;
  document.querySelectorAll('#tpFilter button').forEach((b) => {
    b.onclick = () => { ADM.tpFilter = b.dataset.f; setChips('tpFilter', b.dataset.f); renderPlanOrders(); };
  });
}

// วันหมดอายุแพลนของผู้ใช้ (ทดลองฟรี 14 วันนับจากวันสมัคร หรือ plan_expires_at แล้วแต่อันไหนนานกว่า — ต้องตรงกับ src/plans.js) — แอดมินไม่มีวันหมดอายุ
function planUntil(u) {
  if (u.role === 'admin') return 'ไม่จำกัด';
  if (u.role !== 'streamer') return '-';
  const exp = Math.max((u.created_at || 0) + 14 * 24 * 3600 * 1000, u.plan_expires_at || 0);
  return (exp < Date.now() ? 'หมดแล้ว · ' : '') + new Date(exp).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

async function loadLists() {
  [ADM.donations, ADM.planOrders] = await Promise.all([
    api('/api/admin/donations').catch(() => []), api('/api/admin/plan-orders').catch(() => []),
  ]);
  renderDonations();
  renderPlanOrders();
  renderOverviewLists();
}

function renderDonations() {
  const q = document.getElementById('donQ').value.trim().toLowerCase().replace(/^@/, '');
  const list = ADM.donations.filter((d) => matches(q, [d.display_name, d.donor_username, d.streamer_username, d.message, d.sticker_code, String(d.amount), ...dateTexts(d.created_at)]));
  const sum = list.reduce((a, d) => a + (d.total_cost ?? d.amount), 0);
  const fee = list.reduce((a, d) => a + (d.platform_fee || 0), 0);
  document.getElementById('donSummary').textContent = `${fmt(list.length)} รายการ · มูลค่า ${baht(sum)} · ค่าธรรมเนียม ${baht(fee)}`;
  document.getElementById('don').innerHTML = list.map((d) => `
    <tr><td>${dtShort(d.created_at)}</td>
      <td><b>${esc(d.display_name || d.donor_username || '-')}</b>${d.donor_username ? `<div class="muted">@${esc(d.donor_username)}</div>` : ''}</td>
      <td>@${esc(d.streamer_username)}</td>
      <td><b>${baht(d.total_cost ?? d.amount)}</b></td>
      <td class="muted">${baht(d.platform_fee || 0)}</td>
      <td>${esc(d.sticker_code || '-')}</td>
      <td class="adm-msg">${esc(d.message || '')}</td></tr>`).join('') || '<tr><td colspan="7" class="adm-empty">ไม่มีรายการ</td></tr>';
}

function renderPlanOrders() {
  const q = document.getElementById('tpQ').value.trim().toLowerCase().replace(/^@/, '');
  const list = ADM.planOrders.filter((t) => (ADM.tpFilter === 'all' || t.status === ADM.tpFilter)
    && matches(q, [t.username, t.reference, t.plan_label, String(t.price), ...dateTexts(t.created_at)]));
  const paid = list.filter((t) => t.status === 'paid').reduce((a, t) => a + t.price, 0);
  document.getElementById('tpSummary').textContent = `${fmt(list.length)} รายการ · ชำระสำเร็จ ${baht(paid)}`;
  const byId = Object.fromEntries(ADM.planOrders.map((t) => [t.id, t]));
  document.getElementById('tp').innerHTML = list.map((t) => {
    const expired = t.status === 'pending' && t.expires_at && t.expires_at < Date.now();
    const [label, cls] = expired ? ['หมดอายุ', ''] : (PL_STATUS[t.status] || [t.status, '']);
    const open = ['pending', 'review'].includes(t.status);
    const actions = [
      t.has_slip ? `<button class="sm ghost tp-slip" data-id="${t.id}">🧾 ดูสลิป</button>` : '',
      open ? `<button class="sm approve tp-approve" data-id="${t.id}">✓ อนุมัติ</button>` : '',
      open ? `<button class="sm danger tp-reject" data-id="${t.id}">ปฏิเสธ</button>` : '',
    ].filter(Boolean).join(' ');
    const note = t.note ? `<div class="muted" style="margin-top:4px">${esc(t.note)}</div>` : '';
    return `<tr><td>${dtShort(t.created_at)}</td><td><b>@${esc(t.username)}</b></td><td>${esc(t.plan_label)}</td><td><b>${baht(t.price)}</b></td>`
      + `<td class="muted">${esc(t.reference || '-')}${t.trans_ref ? `<div title="เลขอ้างอิงธนาคาร">${esc(t.trans_ref)}</div>` : ''}</td>`
      + `<td class="adm-wrap"><span class="pd-st ${cls}">${label}</span>${note}</td><td class="adm-actions">${actions}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="adm-empty">ไม่มีรายการ</td></tr>';

  document.querySelectorAll('#tp .tp-slip').forEach((b) => {
    b.onclick = () => {
      const t = byId[b.dataset.id], url = '/api/admin/plan-orders/' + t.id + '/slip';
      Swal.fire({
        title: `สลิปค่าแพลน ${esc(t.plan_label)} · ${baht(t.price)}`, imageUrl: url, imageAlt: 'สลิป', customClass: { image: 'slip-img' },
        html: `@${esc(t.username)} · ${esc(t.reference)}${t.note ? `<div class="muted" style="margin-top:6px">${esc(t.note)}</div>` : ''}
          <div style="margin-top:6px"><a href="${url}" target="_blank" rel="noopener">เปิดรูปเต็มในแท็บใหม่</a></div>`,
        confirmButtonText: 'ปิด',
      });
    };
  });
  document.querySelectorAll('#tp .tp-approve').forEach((b) => {
    b.onclick = async () => {
      const t = byId[b.dataset.id];
      const r = await Swal.fire({
        icon: 'question', title: `อนุมัติแพลน ${esc(t.plan_label)} (${baht(t.price)})?`,
        html: `ต่ออายุแพลนให้ @${esc(t.username)}<br><span class="muted">ตรวจในแอปธนาคารก่อนว่าเงินเข้าบัญชีแล้วจริง ยอดตรง และสลิปนี้ไม่เคยใช้</span>`,
        showCancelButton: true, confirmButtonText: 'อนุมัติ เงินเข้าแล้ว', cancelButtonText: 'ยกเลิก', reverseButtons: true,
      });
      if (!r.isConfirmed) return;
      try {
        await api('/api/admin/plan-orders/' + t.id + '/process', { method: 'POST', body: { status: 'paid' } });
        toast('อนุมัติและต่ออายุแพลนแล้ว'); loadLists(); loadStats();
      } catch (e) { toast(e.message, false); }
    };
  });
  document.querySelectorAll('#tp .tp-reject').forEach((b) => {
    b.onclick = async () => {
      const r = await Swal.fire({
        icon: 'warning', title: 'ปฏิเสธรายการนี้?', text: 'ผู้ใช้จะเห็นเหตุผลนี้ และแพลนจะไม่ถูกต่ออายุ',
        input: 'text', inputPlaceholder: 'เหตุผล เช่น ไม่พบยอดเงินเข้าบัญชี',
        inputValidator: (v) => (!v.trim() ? 'กรุณาระบุเหตุผล' : undefined),
        showCancelButton: true, confirmButtonText: 'ปฏิเสธ', cancelButtonText: 'ยกเลิก', reverseButtons: true,
        customClass: { confirmButton: 'swal2-danger' },
      });
      if (!r.isConfirmed) return;
      try {
        await api('/api/admin/plan-orders/' + b.dataset.id + '/process', { method: 'POST', body: { status: 'rejected', note: r.value.trim() } });
        toast('ปฏิเสธรายการแล้ว'); loadLists(); loadStats();
      } catch (e) { toast(e.message, false); }
    };
  });
}

// ---------- สติกเกอร์ ----------
function initStickers() {
  const sel = document.getElementById('ns_anim');
  STICKER_ANIMS.forEach(([v, l]) => sel.append(el('option', { value: v }, `${l} (${v})`)));
  document.getElementById('addSticker').onclick = addSticker;
}

async function loadStickers() {
  ADM.stickers = await api('/api/admin/stickers').catch(() => []);
  const box = document.getElementById('stickers');
  box.innerHTML = '';
  ADM.stickers.forEach((s) => {
    const card = el('div', { class: 'adm-stk' + (s.enabled ? '' : ' off') });
    const animOpts = STICKER_ANIMS.map(([v, l]) => `<option value="${v}" ${v === s.animation ? 'selected' : ''}>${l}</option>`).join('');
    card.innerHTML = `
      <div class="adm-stk-top">
        <span class="adm-stk-art">${s.image_url ? `<img src="${esc(s.image_url)}" alt="">` : esc(s.emoji || '⭐')}</span>
        <label class="adm-switch" title="เปิด/ปิดการใช้งาน"><input type="checkbox" class="s_en" ${s.enabled ? 'checked' : ''}><span></span></label>
      </div>
      <div class="adm-stk-code">${esc(s.code)}</div>
      <div class="adm-stk-grid">
        <input class="s_name" value="${esc(s.name)}" placeholder="ชื่อ">
        <input class="s_emoji" value="${esc(s.emoji || '')}" placeholder="อีโมจิ">
        <input class="s_cost" type="number" min="0" value="${s.cost}" placeholder="ราคา">
        <select class="s_anim">${animOpts}</select>
      </div>
      <div class="adm-stk-actions"><button type="button" class="sm save">บันทึก</button><button type="button" class="sm ghost del">ลบ</button></div>`;
    const body = () => ({
      name: card.querySelector('.s_name').value,
      emoji: card.querySelector('.s_emoji').value,
      cost: Number(card.querySelector('.s_cost').value),
      animation: card.querySelector('.s_anim').value,
      enabled: card.querySelector('.s_en').checked,
    });
    card.querySelector('.save').onclick = async () => {
      try { await api('/api/admin/stickers/' + s.id, { method: 'PUT', body: body() }); toast('บันทึกสติกเกอร์แล้ว'); loadStickers(); }
      catch (e) { toast(e.message, false); }
    };
    card.querySelector('.s_en').onchange = async (e) => {
      try {
        await api('/api/admin/stickers/' + s.id, { method: 'PUT', body: { enabled: e.target.checked } });
        card.classList.toggle('off', !e.target.checked);
        toast(e.target.checked ? 'เปิดใช้สติกเกอร์แล้ว' : 'ปิดสติกเกอร์แล้ว');
      } catch (err) { toast(err.message, false); }
    };
    card.querySelector('.del').onclick = async () => {
      if (!(await confirmDialog(`ลบสติกเกอร์ "${s.name}"?`, 'การลบไม่สามารถย้อนกลับได้', { confirmText: 'ลบ', danger: true }))) return;
      try { await api('/api/admin/stickers/' + s.id, { method: 'DELETE' }); toast('ลบสติกเกอร์แล้ว'); loadStickers(); }
      catch (e) { toast(e.message, false); }
    };
    box.append(card);
  });
  if (!ADM.stickers.length) box.innerHTML = '<div class="card adm-empty">ยังไม่มีสติกเกอร์</div>';
}

async function addSticker() {
  try {
    await api('/api/admin/stickers', {
      method: 'POST',
      body: {
        code: document.getElementById('ns_code').value,
        name: document.getElementById('ns_name').value,
        emoji: document.getElementById('ns_emoji').value,
        cost: Number(document.getElementById('ns_cost').value),
        animation: document.getElementById('ns_anim').value,
      },
    });
    toast('เพิ่มสติกเกอร์แล้ว');
    ['ns_code', 'ns_name', 'ns_emoji', 'ns_cost'].forEach((i) => (document.getElementById(i).value = ''));
    loadStickers();
  } catch (e) { toast(e.message, false); }
}

// ---------- ตั้งค่าระบบ ----------
function initSettings() {
  document.getElementById('saveCfg').onclick = saveConfig;
}

async function loadConfig() {
  const c = await api('/api/admin/config').catch(() => ({}));
  document.getElementById('c_site').value = c.site_name || '';
  document.getElementById('c_min').value = c.default_min_donation || '1';
  document.getElementById('c_max').value = c.default_max_donation || '1000';
}

async function saveConfig() {
  try {
    await api('/api/admin/config', {
      method: 'PUT',
      body: {
        site_name: document.getElementById('c_site').value,
        default_min_donation: document.getElementById('c_min').value,
        default_max_donation: document.getElementById('c_max').value,
      },
    });
    toast('บันทึกการตั้งค่าแล้ว');
  } catch (e) { toast(e.message, false); }
}

