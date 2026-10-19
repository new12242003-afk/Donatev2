// ---------- แผงควบคุมแอดมิน: เมนูด้านข้าง + แท็บ (ภาพรวม / ผู้ใช้ / ประวัติผู้ใช้ / โดเนท / ชำระค่าแพลน / สติกเกอร์ / ตั้งค่า) ----------
const ADM = {
  users: [], userFilter: 'all',
  donations: [], planOrders: [], tpFilter: 'all',
  planHistory: [], phFilter: 'all',
  stickers: [],
};
// หน้าประวัติผู้ใช้ (#user/<id>): id = ผู้ใช้ที่เปิดอยู่, data = ผลจาก /api/admin/users/:id/history, tab = หมวดที่เลือก
// status = ตัวกรองสถานะของแท็บนั้น, period = ตัวกรองช่วงเวลา (common.js periodFilter) ใช้ร่วมทุกแท็บ
const UH = { id: null, data: null, tab: 'sent', status: 'all', period: null };
const STICKER_ANIMS = [
  ['float', 'ลอยขึ้น'], ['rain', 'ตกลงมา'], ['bounce', 'เด้ง'], ['zoom', 'ซูม'],
  ['spin', 'หมุน'], ['fly', 'บินข้าม'], ['shake', 'สั่น'], ['petals', 'กลีบดอกไม้โปรย'],
];
const ROLE_LABEL = { admin: 'แอดมิน', streamer: 'สตรีมเมอร์', donor: 'ผู้โดเนท' };
const PL_STATUS = { paid: ['สำเร็จ', 'on'], pending: ['รอชำระ', 'wait'], review: ['รอตรวจสลิป', 'wait'], rejected: ['ปฏิเสธ', 'off'] };
const baht = (n) => Number(n || 0).toLocaleString('th-TH') + ' ฿';
const dtShort = (ts) => new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const dShort = (ts) => new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

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
  initUserHistory();
  initLists();
  initStickers();
  initSettings();
  initSupport({ admin: true });
  document.getElementById('admRefresh').onclick = () => {
    loadAll();
    if (openHistoryId()) loadUserHistory(openHistoryId());
    toast('รีเฟรชข้อมูลแล้ว');
  };
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
  // #support/<id> = เปิดแชทเรื่องนั้น (support.js จัดการต่อเอง) / #user/<id> = ประวัติของผู้ใช้คนนั้น
  const supportLink = /^support\/\d+$/.test(tab || '');
  const userLink = /^user\/(\d+)$/.exec(tab || '');
  if (supportLink) tab = 'support';
  if (userLink) tab = 'userhistory';
  const panels = [...document.querySelectorAll('.adm-panel')];
  if (!panels.some((p) => p.dataset.apanel === tab) || (tab === 'userhistory' && !userLink)) tab = 'overview';
  panels.forEach((p) => { p.hidden = p.dataset.apanel !== tab; });
  // หน้าประวัติผู้ใช้ไม่มีเมนูของตัวเอง — ไฮไลต์เมนู "ผู้ใช้งาน" แทน
  const navTab = tab === 'userhistory' ? 'users' : tab;
  document.querySelectorAll('#admNav [data-atab]').forEach((b) => b.classList.toggle('active', b.dataset.atab === navTab));
  const hash = supportLink || userLink ? requested : tab;
  if (location.hash.slice(1) !== hash) history.replaceState(null, '', '#' + hash);
  if (userLink) loadUserHistory(Number(userLink[1]));
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
  const kpi = (icon, tone, label, value, sub, goto) => kpiCard(icon, tone, label, value, sub, goto ? `data-goto="${goto}"` : '');
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

// การ์ดตัวเลข — attr = แอตทริบิวต์ที่ทำให้กดได้ (เช่น data-goto="users") ไม่ใส่ = การ์ดเฉย ๆ
function kpiCard(icon, tone, label, value, sub, attr = '') {
  return `
    <div class="adm-kpi${attr ? ' link' : ''}" ${attr}>
      <span class="adm-kpi-ic ${tone}">${icon}</span>
      <div class="adm-kpi-label">${label}</div>
      <div class="adm-kpi-value">${value}</div>
      <div class="adm-kpi-sub">${sub}</div>
    </div>`;
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
      <td class="adm-actions"><button type="button" class="sm ghost history">ประวัติ</button> <button type="button" class="sm ghost manage">จัดการ</button></td>
    </tr>`).join('') || '<tr><td colspan="6" class="adm-empty">ไม่พบผู้ใช้</td></tr>';
  document.querySelectorAll('#users tr[data-id] .manage').forEach((b) => {
    b.onclick = () => openUserModal(Number(b.closest('tr').dataset.id));
  });
  document.querySelectorAll('#users tr[data-id] .history').forEach((b) => {
    b.onclick = () => openUserHistory(Number(b.closest('tr').dataset.id));
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
  document.getElementById('umHistory').onclick = () => { close(); openUserHistory(umUser.id); };
  document.getElementById('umPlanAdd').onclick = async () => {
    const v = await promptDialog(`เพิ่มวันใช้งานแพลนให้ @${umUser.username} (ฟรี)`, {
      input: 'number', placeholder: 'จำนวนวัน เช่น 30',
      validate: (x) => !(Number.isInteger(Number(x)) && Number(x) >= 1 && Number(x) <= 3650) && 'ใส่จำนวนเต็ม 1–3650 วัน',
    });
    if (!v) return;
    try {
      const r = await api('/api/admin/users/' + umUser.id + '/plan-days', { method: 'POST', body: { days: Number(v) } });
      toast(`เพิ่ม ${v} วันแล้ว · ใช้ได้ถึง ${new Date(r.status.expires_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}`);
      await refreshUser();
    } catch (e) { toast(e.message, false); }
  };
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
  const id = umUser.id;
  await loadUsers();
  loadStats();
  loadLists(); // เพิ่มวันแพลน = มีแถวใหม่ในประวัติการสมัครแพลน
  // เปิดหน้าประวัติของคนนี้อยู่ → อัปเดตหัวข้อ (บทบาท / สถานะ / แพลน) ด้วย
  if (openHistoryId() === id) await loadUserHistory(id);
  // รายชื่อผู้ใช้โหลดแค่ 200 บัญชีล่าสุด — บัญชีที่เก่ากว่านั้นใช้ข้อมูลจากหน้าประวัติแทน
  const u = ADM.users.find((x) => x.id === id) || (UH.data && UH.data.user.id === id ? UH.data.user : null);
  if (u) openUserModal(u.id, u);
}

// fallback = ข้อมูลผู้ใช้จากหน้าประวัติ (ใช้เมื่อไม่อยู่ใน ADM.users)
function openUserModal(id, fallback) {
  const u = ADM.users.find((x) => x.id === id) || fallback;
  if (!u) return;
  umUser = u;
  document.getElementById('umAvatar').innerHTML = avatarHtml(u, 'adm-av lg');
  document.getElementById('umName').textContent = u.display_name || u.username;
  document.getElementById('umSub').textContent = `@${u.username} · ${u.email || '-'} · ID ${u.id}`;
  document.getElementById('umPlan').textContent = planUntil(u);
  document.querySelectorAll('#umRole button').forEach((b) => b.classList.toggle('active', b.dataset.r === u.role));
  document.getElementById('umPlanAdd').hidden = u.role !== 'streamer';
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
  ADM.phPeriod = periodFilter('ph', renderPlanHistoryAll, { remember: false });
  document.getElementById('phQ').oninput = renderPlanHistoryAll;
  document.querySelectorAll('#phFilter button').forEach((b) => {
    b.onclick = () => { ADM.phFilter = b.dataset.f; setChips('phFilter', b.dataset.f); renderPlanHistoryAll(); };
  });
  document.getElementById('ph').onclick = (e) => {
    const b = e.target.closest('.ph-user');
    if (b) openUserHistory(Number(b.dataset.id));
  };
}

// วันหมดอายุแพลนของผู้ใช้ (ทดลองฟรี 14 วันนับจากวันสมัคร หรือ plan_expires_at แล้วแต่อันไหนนานกว่า — ต้องตรงกับ src/plans.js) — แอดมินไม่มีวันหมดอายุ
function planUntil(u) {
  if (u.role === 'admin') return 'ไม่จำกัด';
  if (u.role !== 'streamer') return '-';
  const exp = Math.max((u.created_at || 0) + 14 * 24 * 3600 * 1000, u.plan_expires_at || 0);
  return (exp < Date.now() ? 'หมดแล้ว · ' : '') + new Date(exp).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

async function loadLists() {
  [ADM.donations, ADM.planOrders, ADM.planHistory] = await Promise.all([
    api('/api/admin/donations').catch(() => []), api('/api/admin/plan-orders').catch(() => []),
    api('/api/admin/plan-history').catch(() => []),
  ]);
  renderDonations();
  renderPlanOrders();
  renderPlanHistoryAll();
  renderOverviewLists();
}

// ---------- ช่วงแพลน (ทดลองฟรี / ซื้อ / แอดมินเพิ่มให้) — แสดงแบบเดียวกับ "ประวัติการสมัครแพลน" ในแดชบอร์ดสตรีมเมอร์ (public/js/dashboard.js) ----------
const planKind = (h) => (h.kind === 'trial' ? 'trial' : h.plan_id === 'admin' ? 'admin' : 'paid');
const planPeriodLabel = (h) => (h.kind === 'trial' ? `ทดลองใช้ฟรี ${fmt(h.days)} วัน` : `${esc(h.label)} (${fmt(h.days)} วัน)`);
const planRange = (h) => (h.starts_at && h.expires_at ? `${dShort(h.starts_at)} – ${dShort(h.expires_at)}` : '—');
const planActive = (h) => !!(h.starts_at && h.expires_at && h.starts_at <= Date.now() && Date.now() < h.expires_at);
// ตัวกรอง: all / active (กำลังใช้งาน) / trial / paid / admin
const planMatch = (h, f) => f === 'all' || (f === 'active' ? planActive(h) : planKind(h) === f);
function planPeriodBadge(h) {
  const t = Date.now();
  if (!h.starts_at || !h.expires_at) return '<span class="pd-st">—</span>';
  if (t < h.starts_at) return '<span class="pd-st wait">รอเริ่มใช้งาน</span>';
  if (t < h.expires_at) return '<span class="pd-st on">กำลังใช้งาน</span>';
  return '<span class="pd-st">หมดอายุแล้ว</span>';
}

function renderPlanHistoryAll() {
  const q = document.getElementById('phQ').value.trim().toLowerCase().replace(/^@/, '');
  const f = ADM.phFilter;
  const list = ADM.planHistory.filter((h) => planMatch(h, f) && ADM.phPeriod.includes(h.created_at)
    && matches(q, [h.username, h.display_name, h.label, h.kind === 'trial' ? 'ทดลองใช้ฟรี' : '', String(h.price),
      ...dateTexts(h.created_at), ...(h.starts_at ? dateTexts(h.starts_at) : []), ...(h.expires_at ? dateTexts(h.expires_at) : [])]));
  const accounts = new Set(list.map((h) => h.user_id)).size;
  document.getElementById('phSummary').textContent = `${ADM.phPeriod.label()} · ${fmt(list.length)} รายการ · ${fmt(accounts)} บัญชี · รายได้ ${baht(sumOf(list, 'price'))}`;
  document.getElementById('ph').innerHTML = list.map((h) => `
    <tr><td>${dtShort(h.created_at)}</td>
      <td><b>${esc(h.display_name || h.username)}</b><div class="muted">@${esc(h.username)}</div></td>
      <td>${planPeriodLabel(h)}</td><td>${h.price ? baht(h.price) : 'ฟรี'}</td>
      <td>${planRange(h)}</td><td>${planPeriodBadge(h)}</td>
      <td class="adm-actions"><button type="button" class="sm ghost ph-user" data-id="${h.user_id}" title="ดูประวัติทั้งหมดของผู้ใช้นี้">ประวัติ</button></td></tr>`).join('')
    || `<tr><td colspan="7" class="adm-empty">${q || f !== 'all' || ADM.phPeriod.p !== 'all' ? 'ไม่พบรายการตามตัวกรองที่เลือก' : 'ไม่มีรายการ'}</td></tr>`;
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
    const open = ['pending', 'review'].includes(t.status);
    const actions = [
      t.has_slip ? `<button class="sm ghost tp-slip" data-id="${t.id}">🧾 ดูสลิป</button>` : '',
      open ? `<button class="sm approve tp-approve" data-id="${t.id}">✓ อนุมัติ</button>` : '',
      open ? `<button class="sm danger tp-reject" data-id="${t.id}">ปฏิเสธ</button>` : '',
    ].filter(Boolean).join(' ');
    const note = t.note ? `<div class="muted" style="margin-top:4px">${esc(t.note)}</div>` : '';
    return `<tr><td>${dtShort(t.created_at)}</td><td><b>@${esc(t.username)}</b></td><td>${esc(t.plan_label)}</td><td><b>${baht(t.price)}</b></td>`
      + `<td class="muted">${esc(t.reference || '-')}${t.trans_ref ? `<div title="เลขอ้างอิงธนาคาร">${esc(t.trans_ref)}</div>` : ''}</td>`
      + `<td class="adm-wrap">${planOrderBadge(t)}${note}</td><td class="adm-actions">${actions}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="adm-empty">ไม่มีรายการ</td></tr>';

  document.querySelectorAll('#tp .tp-slip').forEach((b) => {
    b.onclick = () => showPlanSlip(byId[b.dataset.id]);
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

// สถานะคำสั่งซื้อแพลน — รอชำระที่เลย QR หมดอายุแล้วนับเป็น "หมดอายุ" (expired)
const planOrderState = (t) => (t.status === 'pending' && t.expires_at && t.expires_at < Date.now() ? 'expired' : t.status);
function planOrderBadge(t) {
  const state = planOrderState(t);
  const [label, cls] = state === 'expired' ? ['หมดอายุ', ''] : (PL_STATUS[state] || [state, '']);
  return `<span class="pd-st ${cls}">${label}</span>`;
}

function showPlanSlip(t) {
  const url = '/api/admin/plan-orders/' + t.id + '/slip';
  Swal.fire({
    title: `สลิปค่าแพลน ${esc(t.plan_label)} · ${baht(t.price)}`, imageUrl: url, imageAlt: 'สลิป', customClass: { image: 'slip-img' },
    html: `@${esc(t.username)} · ${esc(t.reference)}${t.note ? `<div class="muted" style="margin-top:6px">${esc(t.note)}</div>` : ''}
      <div style="margin-top:6px"><a href="${url}" target="_blank" rel="noopener">เปิดรูปเต็มในแท็บใหม่</a></div>`,
    confirmButtonText: 'ปิด',
  });
}

// ---------- ประวัติผู้ใช้ (#user/<id>) ----------
const sumOf = (list, key) => list.reduce((a, r) => a + (Number(r[key]) || 0), 0);

const DON_STATUS = [['all', 'ทั้งหมด'], ['money', 'โดเนทเงิน'], ['sticker', 'ส่งสติกเกอร์']];
const donMatch = (r, s) => s === 'all' || (s === 'sticker' ? !!r.sticker_code : !r.sticker_code);

// แต่ละหมวด: rows = รายการจาก API, date = เวลาที่ใช้กับตัวกรองช่วงเวลา (คอลัมน์แรกของตาราง),
// status / match = ตัวเลือกตัวกรองสถานะ [ค่า, ป้าย] (all = ไม่กรอง) และเงื่อนไข, text = คำที่ค้นหาได้, sum = สรุปใต้ตัวกรอง, row = เซลล์ในตาราง
const UH_TABS = {
  sent: {
    head: ['เวลา', 'ให้สตรีมเมอร์', 'จำนวน', 'สติกเกอร์', 'ชื่อที่แสดง / ข้อความ'],
    rows: (d) => d.donations_sent,
    date: (r) => r.created_at,
    status: DON_STATUS, match: donMatch,
    text: (r) => [r.streamer_username, r.streamer_name, r.display_name, r.message, r.sticker_code, String(r.amount), ...dateTexts(r.created_at)],
    sum: (list) => `${fmt(list.length)} รายการ · รวม ${baht(sumOf(list, 'amount'))}`,
    row: (r) => `<td>${dtShort(r.created_at)}</td>
      <td><b>@${esc(r.streamer_username)}</b>${r.streamer_name ? `<div class="muted">${esc(r.streamer_name)}</div>` : ''}</td>
      <td><b>${baht(r.amount)}</b></td><td>${esc(r.sticker_code || '-')}</td>
      <td class="adm-msg"><b>${esc(r.display_name)}</b>${r.message ? `<div class="muted">${esc(r.message)}</div>` : ''}</td>`,
  },
  received: {
    head: ['เวลา', 'ผู้ส่ง', 'จำนวน', 'สติกเกอร์', 'ข้อความ'],
    rows: (d) => d.donations_received,
    date: (r) => r.created_at,
    status: DON_STATUS, match: donMatch,
    text: (r) => [r.display_name, r.donor_username, r.message, r.sticker_code, String(r.amount), ...dateTexts(r.created_at)],
    sum: (list) => `${fmt(list.length)} รายการ · รวม ${baht(sumOf(list, 'amount'))}`,
    row: (r) => `<td>${dtShort(r.created_at)}</td>
      <td><b>${esc(r.display_name)}</b><div class="muted">${r.donor_username ? '@' + esc(r.donor_username) : 'ไม่ได้ล็อกอิน'}</div></td>
      <td><b>${baht(r.amount)}</b></td><td>${esc(r.sticker_code || '-')}</td><td class="adm-msg">${esc(r.message || '')}</td>`,
  },
  plan: {
    head: ['วันที่สมัคร', 'แพลน', 'ราคา', 'ช่วงเวลาใช้งาน', 'สถานะ'],
    rows: (d) => d.plan_history,
    date: (r) => r.created_at,
    status: [['all', 'ทั้งหมด'], ['active', 'กำลังใช้งาน'], ['trial', 'ทดลองใช้ฟรี'], ['paid', 'ซื้อแพลน'], ['admin', 'แอดมินเพิ่มให้']],
    match: planMatch,
    text: (r) => [r.label, r.kind === 'trial' ? 'ทดลองใช้ฟรี' : '', String(r.price), ...dateTexts(r.created_at),
      ...(r.starts_at ? dateTexts(r.starts_at) : []), ...(r.expires_at ? dateTexts(r.expires_at) : [])],
    sum: (list) => `${fmt(list.length)} รายการ · จ่ายรวม ${baht(sumOf(list, 'price'))}`,
    row: (r) => `<td>${dtShort(r.created_at)}</td><td><b>${planPeriodLabel(r)}</b></td><td>${r.price ? baht(r.price) : 'ฟรี'}</td>
      <td>${planRange(r)}</td><td>${planPeriodBadge(r)}</td>`,
  },
  orders: {
    head: ['เวลา', 'แพลน', 'ยอด', 'รหัสอ้างอิง', 'สถานะ', ''],
    rows: (d) => d.plan_orders,
    date: (r) => r.created_at,
    status: [['all', 'ทั้งหมด'], ['paid', 'สำเร็จ'], ['review', 'รอตรวจสลิป'], ['pending', 'รอชำระ'], ['expired', 'หมดอายุ'], ['rejected', 'ปฏิเสธ']],
    match: (r, s) => s === 'all' || planOrderState(r) === s,
    text: (r) => [r.reference, r.trans_ref, r.plan_label, r.note, String(r.price), ...dateTexts(r.created_at)],
    sum: (list) => `${fmt(list.length)} รายการ · ชำระสำเร็จ ${baht(sumOf(list.filter((o) => o.status === 'paid'), 'price'))}`,
    row: (r) => `<td>${dtShort(r.created_at)}</td><td>${esc(r.plan_label)}</td><td><b>${baht(r.price)}</b></td>
      <td class="muted">${esc(r.reference || '-')}${r.trans_ref ? `<div title="เลขอ้างอิงธนาคาร">${esc(r.trans_ref)}</div>` : ''}</td>
      <td class="adm-wrap">${planOrderBadge(r)}${r.note ? `<div class="muted" style="margin-top:4px">${esc(r.note)}</div>` : ''}</td>
      <td class="adm-actions">${r.has_slip ? `<button type="button" class="sm ghost uh-slip" data-id="${r.id}">🧾 ดูสลิป</button>` : ''}</td>`,
  },
  tickets: {
    head: ['อัปเดตล่าสุด', 'หัวข้อ', 'หมวด', 'สถานะ', 'ข้อความ', ''],
    rows: (d) => d.tickets,
    date: (r) => r.updated_at,
    status: [['all', 'ทั้งหมด'], ['open', 'รอตอบ'], ['answered', 'ตอบแล้ว'], ['closed', 'ปิดแล้ว']],
    match: (r, s) => s === 'all' || r.status === s,
    text: (r) => [r.subject, r.category, ...dateTexts(r.updated_at), ...dateTexts(r.created_at)],
    sum: (list) => `${fmt(list.length)} เรื่อง · รอตอบ ${fmt(list.filter((t) => t.status === 'open').length)} เรื่อง`,
    row: (r) => {
      const [label, cls] = SUP_STATUS_ADMIN[r.status] || [r.status, ''];
      return `<td>${dtShort(r.updated_at)}</td>
        <td class="adm-msg"><b>${esc(r.subject)}</b><div class="muted">เปิดเมื่อ ${dtShort(r.created_at)}</div></td>
        <td>${esc(r.category)}</td><td><span class="pd-st ${cls}">${label}</span></td><td>${fmt(r.messages)}</td>
        <td class="adm-actions"><button type="button" class="sm ghost uh-ticket" data-id="${r.id}">เปิดแชท →</button></td>`;
    },
  },
};

const openHistoryId = () => { const m = /^#user\/(\d+)$/.exec(location.hash); return m ? Number(m[1]) : null; };

function openUserHistory(id) {
  window.scrollTo({ top: 0 });
  // hash เดิมอยู่แล้ว = ไม่มี hashchange ต้องสั่งเอง
  if (openHistoryId() === id) switchAdmTab('user/' + id);
  else location.hash = 'user/' + id;
}

function initUserHistory() {
  document.getElementById('uhBack').onclick = () => { location.hash = 'users'; };
  document.getElementById('uhManage').onclick = () => { if (UH.data) openUserModal(UH.data.user.id, UH.data.user); };
  // เปลี่ยนแท็บ = ล้างตัวกรองสถานะ (แต่ละแท็บมีตัวเลือกคนละชุด) ส่วนช่วงเวลาใช้ต่อทุกแท็บ
  const openTab = (tab) => { UH.tab = tab; UH.status = 'all'; renderUhTable(); };
  document.querySelectorAll('#uhTabs button').forEach((b) => { b.onclick = () => openTab(b.dataset.f); });
  document.getElementById('uhKpis').onclick = (e) => {
    const k = e.target.closest('[data-uh]');
    if (k) openTab(k.dataset.uh);
  };
  document.getElementById('uhStatus').onclick = (e) => {
    const b = e.target.closest('button[data-f]');
    if (b) { UH.status = b.dataset.f; renderUhTable(); }
  };
  UH.period = periodFilter('uh', renderUhTable, { remember: false });
  let t = null;
  document.getElementById('uhQ').oninput = () => { clearTimeout(t); t = setTimeout(renderUhTable, 150); };
  document.getElementById('uhBody').onclick = (e) => {
    const slip = e.target.closest('.uh-slip');
    if (slip) {
      const o = UH.data.plan_orders.find((x) => x.id === Number(slip.dataset.id));
      if (o) showPlanSlip({ ...o, username: UH.data.user.username });
      return;
    }
    const ticket = e.target.closest('.uh-ticket');
    if (ticket) location.hash = 'support/' + ticket.dataset.id;
  };
}

async function loadUserHistory(id) {
  const fresh = UH.id !== id;
  if (fresh) {
    UH.id = id; UH.data = null; UH.status = 'all';
    document.getElementById('uhQ').value = '';
    renderUserHistory();
  }
  let data;
  try { data = await api('/api/admin/users/' + id + '/history'); }
  catch (e) {
    if (UH.id !== id) return;
    document.getElementById('uhTop').innerHTML = `<div class="adm-empty">${esc(e.message)}</div>`;
    return;
  }
  if (UH.id !== id) return; // ระหว่างโหลดสลับไปดูคนอื่นแล้ว
  UH.data = data;
  // เปิดครั้งแรก: สตรีมเมอร์ที่มีโดเนทเข้า เริ่มที่ "โดเนทที่ได้รับ" นอกนั้นเริ่มที่ "โดเนทที่ส่ง"
  if (fresh) UH.tab = data.user.role !== 'donor' && data.donations_received.length ? 'received' : 'sent';
  renderUserHistory();
}

// หมวดไหนแสดงบ้าง — ผู้โดเนทที่ไม่เคยมีรายการด้านสตรีมเมอร์ ไม่ต้องเห็นแท็บโดเนทที่ได้รับ / แพลน
function uhVisible(d) {
  const u = d.user;
  return {
    sent: true,
    received: u.role !== 'donor' || d.donations_received.length > 0,
    plan: d.plan_history.length > 0,
    orders: u.role === 'streamer' || d.plan_orders.length > 0,
    tickets: true,
  };
}

function renderUserHistory() {
  const d = UH.data;
  if (!d) {
    document.getElementById('uhTop').innerHTML = '<div class="muted">กำลังโหลดประวัติ…</div>';
    ['uhKpis', 'uhHead', 'uhBody', 'uhSummary'].forEach((i) => { document.getElementById(i).innerHTML = ''; });
    return;
  }
  const u = d.user, s = d.summary, show = uhVisible(d);
  document.getElementById('uhTop').innerHTML = `${avatarHtml(u, 'adm-av lg')}
    <div><h2>${esc(u.display_name || u.username)}</h2>
      <div class="muted">@${esc(u.username)} · ${esc(u.email || '-')} · ID ${u.id}</div>
      <div class="adm-uh-tags">
        <span class="adm-role ${u.role}">${ROLE_LABEL[u.role] || u.role}</span>
        ${u.banned ? '<span class="pd-st off">ระงับ</span>' : '<span class="pd-st on">ปกติ</span>'}
        ${u.email_verified ? '' : '<span class="pd-st wait">ยังไม่ยืนยันอีเมล</span>'}
        ${u.google ? '<span class="pd-st">เชื่อมบัญชี Google</span>' : ''}
        <span class="muted">สมัครเมื่อ ${dShort(u.created_at)}${u.role === 'donor' ? '' : ' · แพลนถึง ' + planUntil(u)}</span>
      </div>
    </div>`;
  document.getElementById('uhKpis').innerHTML = [
    kpiCard('💸', 'green', 'โดเนทที่ส่ง', baht(s.sent.total), `${fmt(s.sent.count)} รายการ`, 'data-uh="sent"'),
    show.received ? kpiCard('🎁', 'pink', 'โดเนทที่ได้รับ', baht(s.received.total), `${fmt(s.received.count)} รายการ`, 'data-uh="received"') : '',
    show.orders ? kpiCard('💳', 'violet', 'ค่าแพลนที่จ่าย', baht(s.plan_paid.total), `${fmt(s.plan_paid.count)} รายการสำเร็จ`, 'data-uh="orders"') : '',
    kpiCard('💬', s.tickets.open ? 'orange' : 'blue', 'ติดต่อแอดมิน', `${fmt(s.tickets.count)} เรื่อง`,
      s.tickets.open ? `รอตอบ ${fmt(s.tickets.open)} เรื่อง` : 'ไม่มีเรื่องค้าง', 'data-uh="tickets"'),
  ].join('');
  document.querySelectorAll('#uhTabs button').forEach((b) => { b.hidden = !show[b.dataset.f]; });
  if (!show[UH.tab]) { UH.tab = 'sent'; UH.status = 'all'; }
  renderUhTable();
}

function renderUhTable() {
  const d = UH.data;
  if (!d) return;
  const cfg = UH_TABS[UH.tab];
  setChips('uhTabs', UH.tab);
  document.getElementById('uhStatus').innerHTML = cfg.status
    .map(([v, label]) => `<button type="button" data-f="${v}" class="${v === UH.status ? 'active' : ''}">${label}</button>`).join('');
  const all = cfg.rows(d);
  const q = document.getElementById('uhQ').value.trim().toLowerCase().replace(/^@/, '');
  const list = all.filter((r) => cfg.match(r, UH.status) && UH.period.includes(cfg.date(r)) && matches(q, cfg.text(r)));
  // API ส่งมาแค่ d.limit รายการล่าสุดต่อหมวด — ตัวเลขบนการ์ดด้านบนนับจากทุกรายการ
  const capped = all.length >= d.limit ? ` · แสดง ${fmt(d.limit)} รายการล่าสุด` : '';
  document.getElementById('uhSummary').textContent = `${UH.period.label()} · ${cfg.sum(list)}${capped}`;
  document.getElementById('uhHead').innerHTML = `<tr>${cfg.head.map((h) => `<th>${h}</th>`).join('')}</tr>`;
  const filtered = q || UH.status !== 'all' || UH.period.p !== 'all';
  document.getElementById('uhBody').innerHTML = list.map((r) => `<tr>${cfg.row(r)}</tr>`).join('')
    || `<tr><td colspan="${cfg.head.length}" class="adm-empty">${filtered ? 'ไม่พบรายการตามตัวกรองที่เลือก' : 'ยังไม่มีรายการ'}</td></tr>`;
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

