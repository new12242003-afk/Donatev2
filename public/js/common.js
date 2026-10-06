// ธีมเว็บ (มืด/สว่าง) — ใส่ data-theme ที่ <html> ทันทีที่สคริปต์นี้โหลด (ต้นแท็ก body) จะได้ไม่กะพริบเป็นธีมเดิมก่อน
// จำค่าที่เลือกไว้ใน localStorage ของเบราว์เซอร์ ค่าเริ่มต้นคือธีมมืด
function getTheme() {
  try { return localStorage.getItem('theme') === 'light' ? 'light' : 'dark'; } catch (_) { return 'dark'; }
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('theme', theme); } catch (_) {}
  document.querySelectorAll('.theme-toggle button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === theme)));
}
document.documentElement.dataset.theme = getTheme();

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error((data && data.error) || 'HTTP ' + res.status);
  return data;
}

async function getMe() {
  try { return await api('/api/me'); } catch (_) { return null; }
}

function fmt(n) { return Number(n || 0).toLocaleString('th-TH'); }

// ไอคอนเพชร = หน่วย Token (ใช้ต่อท้ายตัวเลขแทนคำว่า "Token" / "T") — รูปอยู่ใน .tk ของ app.css
function tokenIcon() { return '<span class="tk" role="img" aria-label="Token"></span>'; }
function tkAmount(n) { return `${fmt(n)}${tokenIcon()}`; }
function navBalanceText(n) {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// อัปเดตยอด Token บนแถบเมนูหลังยอดเปลี่ยน (โดเนท/เติมเงิน) โดยไม่ต้องรีเฟรชหน้า
function updateNavBalance(n) {
  const amt = document.querySelector('header.nav .user-chip-amount');
  if (amt) amt.textContent = navBalanceText(n);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of kids) e.append(c);
  return e;
}

const SwalToast = window.Swal && Swal.mixin({
  toast: true, position: 'bottom-end', showConfirmButton: false,
  timer: 3500, timerProgressBar: true,
  didOpen: (t) => { t.onmouseenter = Swal.stopTimer; t.onmouseleave = Swal.resumeTimer; },
});

// เสียงประกอบข้อความแจ้งเตือน — สังเคราะห์ด้วย Web Audio ไม่ต้องโหลดไฟล์
// ปิดเสียงได้ด้วย localStorage.setItem('uiSound', 'off')
let uiAudioCtx = null;
const UI_SOUNDS = {
  success: [[660, 0, 0.12], [880, 0.1, 0.18]],   // [ความถี่ Hz, เริ่ม (วิ), ยาว (วิ)] — สองโน้ตไล่ขึ้น
  error: [[300, 0, 0.16], [220, 0.14, 0.22]],     // สองโน้ตไล่ลง
  question: [[520, 0, 0.14]],                      // โน้ตเดียวสั้น ๆ
  warning: [[440, 0, 0.12], [440, 0.18, 0.12]],    // เคาะซ้ำสองครั้ง
};

function playUiSound(type = 'success') {
  try {
    if (localStorage.getItem('uiSound') === 'off') return;
  } catch (_) {}
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    uiAudioCtx = uiAudioCtx || new AC();
    if (uiAudioCtx.state === 'suspended') uiAudioCtx.resume();
    const t0 = uiAudioCtx.currentTime;
    (UI_SOUNDS[type] || UI_SOUNDS.success).forEach(([freq, start, len]) => {
      const osc = uiAudioCtx.createOscillator();
      const gain = uiAudioCtx.createGain();
      osc.type = type === 'error' ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + start);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + len);
      osc.connect(gain).connect(uiAudioCtx.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + len + 0.02);
    });
  } catch (_) {}
}

function toast(msg, ok = true) {
  playUiSound(ok ? 'success' : 'error');
  if (SwalToast) return SwalToast.fire({ icon: ok ? 'success' : 'error', title: msg });
  // fallback ถ้าโหลด SweetAlert2 จาก CDN ไม่ได้
  const t = el('div', { class: 'toast ' + (ok ? 'ok' : 'err') }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3500);
}

// ยืนยันการกระทำ → Promise<boolean>
async function confirmDialog(title, text = '', { confirmText = 'ยืนยัน', danger = false } = {}) {
  if (!window.Swal) return confirm(text ? title + '\n' + text : title);
  playUiSound(danger ? 'warning' : 'question');
  const r = await Swal.fire({
    title, text, icon: danger ? 'warning' : 'question',
    showCancelButton: true, confirmButtonText: confirmText, cancelButtonText: 'ยกเลิก',
    reverseButtons: true, focusCancel: danger,
    customClass: danger ? { confirmButton: 'swal2-danger' } : {},
  });
  return r.isConfirmed;
}

// กล่องรับค่า → Promise<string|null> (null = ยกเลิก)
async function promptDialog(title, { input = 'text', placeholder = '', validate } = {}) {
  if (!window.Swal) return prompt(title);
  playUiSound('question');
  const r = await Swal.fire({
    title, input, inputPlaceholder: placeholder,
    showCancelButton: true, confirmButtonText: 'ตกลง', cancelButtonText: 'ยกเลิก',
    reverseButtons: true, inputValidator: validate,
  });
  return r.isConfirmed ? r.value : null;
}

// ---------- ลิงก์โซเชียลมีเดีย — ลำดับต้องตรงกับ SOCIAL_KEYS ใน src/social.js ----------
const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', icon: '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.2"/>' },
  { key: 'youtube', label: 'YouTube', icon: '<rect x="1.5" y="5" width="21" height="14" rx="4"/><path d="M10 9l5 3-5 3z" class="c"/>' },
  { key: 'tiktok', label: 'TikTok', icon: '<path d="M14 3h3a4.5 4.5 0 0 0 4 4v3a7.5 7.5 0 0 1-4-1.3V15a6 6 0 1 1-6-6v3.2a2.8 2.8 0 1 0 3 2.8z"/>' },
  { key: 'facebook', label: 'Facebook', icon: '<rect x="2" y="2" width="20" height="20" rx="3"/><path d="M15.5 22v-7.5h2.4l.4-2.9h-2.8V9.8c0-.8.3-1.4 1.5-1.4h1.4V5.8a19 19 0 0 0-2.1-.1c-2.1 0-3.5 1.3-3.5 3.6v2.3h-2.4v2.9h2.4V22z" class="c"/>' },
  { key: 'twitter', label: 'Twitter', icon: '<path d="M3 3h5l13 18h-5z"/><path d="M3.5 21L10.6 13M13.4 11L20.5 3" stroke="currentColor" stroke-width="2.2"/>' },
  { key: 'linkedin', label: 'LinkedIn', icon: '<rect x="2" y="2" width="20" height="20" rx="3"/><rect x="6" y="10" width="2.6" height="8" class="c"/><circle cx="7.3" cy="6.8" r="1.5" class="c"/><path d="M10.8 10h2.5v1.2c.5-.8 1.5-1.4 2.8-1.4 2 0 3 1.3 3 3.6V18h-2.6v-4.2c0-1.1-.4-1.8-1.4-1.8s-1.7.7-1.7 1.8V18h-2.6z" class="c"/>' },
  { key: 'spotify', label: 'Spotify', icon: '<circle cx="12" cy="12" r="10"/><path d="M6.5 9.3c3.8-1.1 8-.8 11.2 1M7.2 12.5c3.1-.8 6.4-.5 9 .9M7.8 15.5c2.4-.6 4.8-.4 6.8.7" class="cs" stroke-width="1.7" stroke-linecap="round" fill="none"/>' },
  { key: 'discord', label: 'Discord', icon: '<path d="M19.3 5.3A16.5 16.5 0 0 0 15.2 4l-.5 1a15 15 0 0 0-5.4 0l-.5-1a16.5 16.5 0 0 0-4.1 1.3C2.1 9.2 1.4 13 1.8 16.8a16.6 16.6 0 0 0 5 2.5l1.1-1.7a10.6 10.6 0 0 1-1.7-.8l.4-.3a11.8 11.8 0 0 0 10.8 0l.4.3a10.6 10.6 0 0 1-1.7.8l1.1 1.7a16.6 16.6 0 0 0 5-2.5c.5-4.4-.8-8.2-2.9-11.5z"/><ellipse cx="8.8" cy="12.6" rx="1.6" ry="1.8" class="c"/><ellipse cx="15.2" cy="12.6" rx="1.6" ry="1.8" class="c"/>' },
  { key: 'twitch', label: 'Twitch', icon: '<path d="M4 2L2.5 6v14h5v2.5h3l2.5-2.5h4l4.5-4.5V2z"/><path d="M5.5 4h14v10.5L16.5 17.5H12L9.5 20v-2.5H5.5z" class="c"/><rect x="11" y="7.5" width="1.8" height="5"/><rect x="15.2" y="7.5" width="1.8" height="5"/>' },
  { key: 'telegram', label: 'Telegram', icon: '<circle cx="12" cy="12" r="10"/><path d="M5.8 11.7l10.6-4.1c.5-.2.9.1.8.8l-1.8 8.5c-.1.6-.5.7-1 .5l-2.8-2-1.3 1.3c-.2.2-.3.3-.6.3l.2-2.9 5.3-4.8c.2-.2 0-.3-.3-.1L8.3 13.3l-2.8-.9c-.6-.2-.6-.6.3-.7z" class="c"/>' },
  { key: 'website', label: 'Blog/Website', icon: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2c2.7 2.8 4 6.1 4 10s-1.3 7.2-4 10c-2.7-2.8-4-6.1-4-10s1.3-7.2 4-10z" class="cs" stroke-width="1.5" fill="none"/>' },
];

function socialIcon(key) {
  const p = SOCIAL_PLATFORMS.find((x) => x.key === key);
  return `<svg class="social-ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${p ? p.icon : ''}</svg>`;
}

// แถวไอคอนลิงก์โซเชียล (ใช้ในการ์ดสตรีมเมอร์หน้าแรก) — คืน null ถ้าไม่มีลิงก์
function socialLinksRow(links) {
  const items = SOCIAL_PLATFORMS.filter((p) => links && links[p.key]);
  if (!items.length) return null;
  const row = el('div', { class: 'social-row' });
  items.forEach((p) => {
    // เซิร์ฟเวอร์รับเฉพาะ http/https อยู่แล้ว แต่เช็กซ้ำอีกชั้นก่อนใส่ใน href
    if (!/^https?:\/\//i.test(links[p.key])) return;
    row.append(el('a', {
      class: 'social-link', href: links[p.key], target: '_blank', rel: 'noopener noreferrer nofollow',
      title: p.label, 'aria-label': p.label, html: socialIcon(p.key),
    }));
  });
  return row;
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  location.href = '/login.html';
}

function roleLabel(r) {
  return r === 'admin' ? 'แอดมิน' : r === 'streamer' ? 'สตรีมเมอร์' : 'ผู้โดเนท';
}

const NAV_ICONS = {
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9"/>',
  streamers: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3a6.5 6.5 0 0 1 3.5 5.7"/>',
  topup: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>',
  admin: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  box: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13h2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3a6.5 6.5 0 0 1 3.5 5.7"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  bank: '<path d="M3 10 12 4l9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  card: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 10.5h7M8.5 13.5h4"/>',
  sparkle: '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
  userplus: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M19 8v6M16 11h6"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
};

function themeToggle() {
  const wrap = el('div', { class: 'theme-toggle', role: 'group', 'aria-label': 'ธีมเว็บ' });
  const current = getTheme();
  [['light', 'sun', 'ธีมสว่าง'], ['dark', 'moon', 'ธีมมืด']].forEach(([theme, icon, label]) => {
    const b = el('button', { type: 'button', title: label, 'aria-label': label, 'aria-pressed': String(theme === current), html: navIcon(icon) });
    b.dataset.theme = theme;
    b.onclick = () => setTheme(theme);
    wrap.append(b);
  });
  return wrap;
}

function navIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${NAV_ICONS[name] || ''}</svg>`;
}

function navLink(href, icon, label, active) {
  const a = el('a', { href, class: 'pill-item' + (active ? ' active' : ''), title: label, 'aria-label': label });
  a.append(el('span', { class: 'pill-item-ic', html: navIcon(icon) }), el('span', {}, label));
  return a;
}

function planBadgeText(plan) {
  if (!plan || plan.kind === 'unlimited') return 'ไม่จำกัด';
  if (!plan.active) return 'หมดอายุ';
  return (plan.kind === 'trial' ? 'ฟรี ' : 'เหลือ ') + plan.days_left + ' วัน';
}

function planButton(plan) {
  const expired = plan && !plan.active;
  const a = el('a', { href: '/plans.html', class: 'plan-btn' + (expired ? ' expired' : ''), title: 'แพลนการใช้งาน' });
  a.append(
    el('span', { class: 'plan-btn-ic', html: navIcon('gift') }),
    el('span', { class: 'plan-btn-label' }, 'แพลน'),
    el('span', { class: 'plan-btn-badge' }, planBadgeText(plan)));
  return a;
}

// ---------- กระดิ่งแจ้งเตือน: ดึงรายการทุก 30 วินาที + เปิดดูเป็น dropdown ----------
const NOTIF_ICONS = { donation: '💸', plan: '⏰', payout: '🏦', support: '💬' };
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'เมื่อสักครู่';
  if (s < 3600) return Math.floor(s / 60) + ' นาทีที่แล้ว';
  if (s < 86400) return Math.floor(s / 3600) + ' ชั่วโมงที่แล้ว';
  if (s < 7 * 86400) return Math.floor(s / 86400) + ' วันที่แล้ว';
  return new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

// แจ้งเตือนแบบ realtime: โหลด socket.io client เอง (บางหน้าไม่ได้ใส่ไว้) แล้วเด้ง toast + อัปเดตกระดิ่งทันที
function listenNotifications(reload) {
  const start = () => {
    const socket = window.io({ transports: ['websocket', 'polling'] });
    window.appSocket = socket;
    (window.__socketWaiters || []).forEach((f) => f(socket));
    socket.on('notify:new', (n) => {
      reload();
      showNotifPopup(n);
    });
  };
  if (window.io) return start();
  const s = document.createElement('script');
  s.src = '/socket.io/socket.io.js';
  s.onload = start;
  document.head.append(s);
}

// ใช้ socket เดียวกับกระดิ่ง (หน้าอื่น ๆ เช่น ติดต่อแอดมิน รอรับ socket ผ่านฟังก์ชันนี้)
function onAppSocket(cb) {
  if (window.appSocket) cb(window.appSocket);
  else (window.__socketWaiters = window.__socketWaiters || []).push(cb);
}

function showNotifPopup(n) {
  // กำลังเปิดหน้าที่แจ้งเตือนชี้อยู่แล้ว (เช่น เปิดแชทเรื่องนั้นค้างไว้) — ไม่ต้องเด้ง
  if (n.link && location.pathname + location.hash === n.link) return;
  playUiSound('success');
  const icon = NOTIF_ICONS[n.type] || '🔔';
  if (!window.Swal) return toast(icon + ' ' + n.title);
  Swal.fire({
    toast: true, position: 'top-end', timer: 7000, timerProgressBar: true, showConfirmButton: !!n.link,
    confirmButtonText: n.type === 'payout' ? 'ดูสลิป / ประวัติ' : 'ดูรายละเอียด',
    title: icon + ' ' + n.title, text: n.body || '',
    customClass: { popup: 'notif-toast' },
    didOpen: (t) => { t.onmouseenter = Swal.stopTimer; t.onmouseleave = Swal.resumeTimer; },
  }).then((r) => {
    if (!r.isConfirmed || !n.link) return;
    const [pathPart, hash] = n.link.split('#');
    if (location.pathname === pathPart && hash) location.hash = hash;
    else location.href = n.link;
  });
}

function notifBell() {
  const wrap = el('div', { class: 'notif' });
  const btn = el('button', { type: 'button', class: 'notif-btn', title: 'การแจ้งเตือน', 'aria-label': 'การแจ้งเตือน', 'aria-expanded': 'false', html: navIcon('bell') });
  const badge = el('span', { class: 'notif-badge', hidden: '' });
  btn.append(badge);
  const panel = el('div', { class: 'notif-panel', hidden: '' });
  const head = el('div', { class: 'notif-head' }, el('b', {}, 'การแจ้งเตือน'));
  const readAll = el('button', { type: 'button', class: 'notif-readall', hidden: '' }, 'อ่านทั้งหมด');
  const clearAll = el('button', { type: 'button', class: 'notif-readall notif-clear', hidden: '' }, 'ลบทั้งหมด');
  head.append(el('span', { class: 'notif-actions' }, readAll, clearAll));
  const listBox = el('div', { class: 'notif-list' });
  panel.append(head, listBox);
  wrap.append(btn, panel);

  let data = { items: [], unread: 0 };
  const render = () => {
    badge.hidden = !data.unread;
    badge.textContent = data.unread > 9 ? '9+' : data.unread;
    readAll.hidden = !data.unread;
    clearAll.hidden = !data.items.length;
    listBox.innerHTML = '';
    if (!data.items.length) {
      listBox.append(el('div', { class: 'notif-empty', html: navIcon('bell') + '<div>ไม่มีการแจ้งเตือน</div>' }));
      return;
    }
    data.items.forEach((n) => {
      const item = el('a', { class: 'notif-item' + (n.read_at ? '' : ' unread'), href: n.link || '#' });
      item.append(
        el('span', { class: 'notif-ic' }, NOTIF_ICONS[n.type] || '🔔'),
        el('span', { class: 'notif-txt' },
          el('span', { class: 'notif-title' }, n.title),
          n.body ? el('span', { class: 'notif-body' }, n.body) : '',
          el('span', { class: 'notif-time' }, timeAgo(n.created_at))));
      item.onclick = (e) => {
        if (!n.link) e.preventDefault();
        if (!n.read_at) api('/api/me/notifications/read', { method: 'POST', body: { id: n.id } }).catch(() => {});
        // ลิงก์ไปหน้าเดิม (เปลี่ยนแค่ #แท็บ) เบราว์เซอร์ไม่โหลดใหม่ → ปิด dropdown เอง
        panel.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        if (!n.read_at) { n.read_at = Date.now(); data.unread = Math.max(0, data.unread - 1); render(); }
      };
      listBox.append(item);
    });
  };
  const load = () => api('/api/me/notifications').then((d) => { data = d; render(); }).catch(() => {});
  // หน้าที่มี realtime (แดชบอร์ด) เรียกให้กระดิ่งโหลดใหม่ทันทีเมื่อมีเหตุการณ์ ไม่ต้องรอรอบ 30 วินาที
  window.refreshNotifications = load;
  listenNotifications(load);

  btn.onclick = (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) load();
  };
  clearAll.onclick = async (e) => {
    e.stopPropagation();
    if (!(await confirmDialog('ลบการแจ้งเตือนทั้งหมด?', 'การแจ้งเตือนทั้งหมดจะถูกลบและกู้คืนไม่ได้', { confirmText: 'ลบทั้งหมด', danger: true }))) return;
    try {
      await api('/api/me/notifications', { method: 'DELETE' });
      data = { items: [], unread: 0 };
      render();
    } catch (err) { toast(err.message, false); }
  };
  readAll.onclick = async (e) => {
    e.stopPropagation();
    await api('/api/me/notifications/read', { method: 'POST', body: {} }).catch(() => {});
    data.items.forEach((n) => { n.read_at = n.read_at || Date.now(); });
    data.unread = 0;
    render();
  };
  panel.onclick = (e) => e.stopPropagation();
  document.addEventListener('click', () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') panel.hidden = true; });

  render();
  load();
  setInterval(() => { if (!document.hidden) load(); }, 30000);
  return wrap;
}

function mountNav(me) {
  const nav = el('header', { class: 'nav' });
  const path = location.pathname;

  nav.append(el('a', { href: '/', class: 'pill-logo' },
    el('span', { class: 'pill-logo-mark' }, '◆'),
    el('span', { class: 'pill-logo-text' },
      el('span', { class: 'l1' }, 'Donate'),
      el('span', { class: 'l2' }, 'Stream'))));

  const items = el('nav', { class: 'pill-items' });
  items.append(navLink('/', 'home', 'หน้าแรก', path === '/' || path === '/index.html'));
  items.append(navLink('/streamers.html', 'streamers', 'สตรีมเมอร์', path === '/streamers.html'));
  if (me) items.append(navLink('/topup.html', 'topup', 'เติมเงิน', path === '/topup.html'));
  if (me && me.role === 'admin') items.append(navLink('/admin.html', 'admin', 'แอดมิน', path === '/admin.html'));
  nav.append(items);

  nav.append(el('div', { class: 'sp' }));
  nav.append(themeToggle());
  if (me) {
    const chip = el('a', { href: '/dashboard.html', class: 'user-chip', title: 'ไปที่แดชบอร์ด' });
    chip.append(me.avatar_url
      ? el('img', { class: 'user-chip-avatar', src: me.avatar_url, alt: '' })
      : el('span', { class: 'user-chip-avatar user-chip-fallback' },
          (me.display_name || me.username || '?').trim().charAt(0).toUpperCase()));
    const balanceBadge = el('span', { class: 'user-chip-balance' },
      el('span', { class: 'user-chip-balance-dot' }),
      el('span', { class: 'user-chip-amount' }, navBalanceText(me.token_balance)),
      el('span', { class: 'tk', role: 'img', 'aria-label': 'Token' }));
    chip.append(el('span', { class: 'user-chip-text' },
      el('span', { class: 'user-chip-name' }, me.display_name || me.username),
      el('span', { class: 'user-chip-role' }, roleLabel(me.role))));
    // อยู่นอกบล็อกชื่อ/role (ไม่ใช่บรรทัดบนของ 2 บรรทัด) เพื่อให้ badge จัดกึ่งกลางแนวตั้งเทียบกับรูปโปรไฟล์ทั้งก้อน
    chip.append(balanceBadge);
    // ปุ่มแพลนข้างชื่อ (สตรีมเมอร์เท่านั้น — แอดมินไม่มีวันหมดอายุ) — badge บอกสถานะ: ทดลองฟรีเหลือกี่วัน / แพลนเหลือกี่วัน / หมดอายุ
    if (me.role === 'streamer') nav.append(planButton(me.plan));
    nav.append(chip);

    const b = el('button', { class: 'pill-auth pill-logout', title: 'ออกจากระบบ', 'aria-label': 'ออกจากระบบ' });
    b.append(el('span', { class: 'pill-logout-ic', html: navIcon('logout') }), el('span', { class: 'pill-logout-txt' }, 'ออกจากระบบ'));
    b.onclick = logout;
    nav.append(notifBell(), b);
  } else {
    nav.append(el('a', { href: '/login.html', class: 'pill-auth' }, 'เข้าสู่ระบบ'));
    nav.append(el('a', { href: '/register.html', class: 'pill-auth pill-auth-primary' }, 'สมัครสมาชิก'));
  }
  nav.append(mobileMenu(me));
  document.body.prepend(nav);
  applySidebarIcons();
  mountFooter();
}

// ---------- เมนูมือถือ: ปุ่ม ☰ → การ์ดเมนูมีไอคอน (+ เมนูของหน้าแดชบอร์ด/แอดมินแยกตามหมวด) ----------
// ไอคอนเส้นของแต่ละแท็บในแดชบอร์ด/แอดมิน (ไม่มีในนี้ = ใช้อีโมจิเดิมของปุ่ม)
const TAB_ICONS = {
  account: 'user', donate: 'receipt', plan: 'box', planhistory: 'history', settings: 'link', overlay: 'monitor',
  earnings: 'wallet', transactions: 'list', leaderboard: 'users', stats: 'chart',
  overview: 'chart', users: 'users', payouts: 'bank', donations: 'heart', topups: 'card', stickers: 'sparkle', sys: 'gear', support: 'chat',
};

// เมนูด้านข้างของแดชบอร์ด/แอดมิน (จอคอม): เปลี่ยนอีโมจิเป็นไอคอนเส้นชุดเดียวกับเมนูมือถือ
function applySidebarIcons() {
  document.querySelectorAll('#dashNav .sidebar-item, #admNav .sidebar-item').forEach((b) => {
    const tab = b.dataset.atab === 'settings' ? 'sys' : (b.dataset.tab || b.dataset.atab);
    const ic = b.querySelector('.ic');
    if (ic && TAB_ICONS[tab]) ic.innerHTML = navIcon(TAB_ICONS[tab]);
  });
  const grp = document.querySelector('#navSupportGroup .ic');
  if (grp) grp.innerHTML = navIcon('heart');
}

function mobileMenu(me) {
  const path = location.pathname;
  const wrap = el('div', { class: 'mnav' });
  const btn = el('button', { type: 'button', class: 'mnav-btn', 'aria-label': 'เปิดเมนู', 'aria-expanded': 'false', html: navIcon('menu') });
  const panel = el('div', { class: 'mnav-panel', hidden: '' });
  wrap.append(btn, panel);

  const item = (href, icon, label, active, onClick) => {
    const a = el(href ? 'a' : 'button', href ? { class: 'mnav-item' + (active ? ' active' : ''), href } : { type: 'button', class: 'mnav-item' + (active ? ' active' : '') });
    a.append(el('span', { class: 'mnav-ic', html: NAV_ICONS[icon] ? navIcon(icon) : '' }), el('span', { class: 'mnav-label' }, label));
    if (onClick) a.onclick = onClick;
    return a;
  };

  const build = () => {
    panel.innerHTML = '';
    const main = el('div', { class: 'mnav-group' });
    main.append(item('/', 'home', 'หน้าแรก', path === '/' || path === '/index.html'));
    main.append(item('/streamers.html', 'streamers', 'สตรีมเมอร์', path === '/streamers.html'));
    if (me) main.append(item('/topup.html', 'topup', 'เติมเงิน', path === '/topup.html'));
    if (me && me.role === 'admin') main.append(item('/admin.html', 'admin', 'แอดมิน', path === '/admin.html'));
    if (me && path !== '/dashboard.html') main.append(item('/dashboard.html', 'user', 'แดชบอร์ดของฉัน', false));
    panel.append(main);

    // ปุ่มแพลน (สีส้ม + ป้ายสถานะ) แบบปุ่มเด่นในรูปตัวอย่าง
    if (me && me.role === 'streamer') {
      const plan = el('a', { class: 'mnav-plan' + (me.plan && !me.plan.active ? ' expired' : ''), href: '/plans.html' });
      plan.append(el('span', { class: 'mnav-ic', html: navIcon('gift') }), el('span', { class: 'mnav-label' }, 'แพลน'), el('span', { class: 'mnav-plan-badge' }, planBadgeText(me.plan)));
      panel.append(plan);
    }

    // เมนูของหน้า (แดชบอร์ด / แอดมิน) — อ่านจากเมนูด้านข้างจริงของหน้า กดแล้วเท่ากับกดปุ่มเดิม
    const side = document.querySelector('#dashNav, #admNav');
    if (side) {
      let group = null;
      [...side.querySelectorAll('.sidebar-section, .sidebar-item')].forEach((n) => {
        if (n.classList.contains('sidebar-section')) {
          if (n.style.display === 'none') { group = null; return; }
          group = el('div', { class: 'mnav-group' }, el('div', { class: 'mnav-head' }, n.textContent.trim()));
          panel.append(group);
          return;
        }
        if (n.style.display === 'none' || !group) return;
        // แอดมินมีแท็บ settings ชื่อซ้ำกับแดชบอร์ด แต่คนละความหมาย (ตั้งค่าระบบ = เฟือง)
        const tab = n.dataset.atab === 'settings' ? 'sys' : (n.dataset.tab || n.dataset.atab);
        const label = [...n.childNodes].filter((c) => c.nodeType === 3 || !c.classList || (!c.classList.contains('ic') && !c.classList.contains('adm-badge'))).map((c) => c.textContent).join('').trim();
        const it = item(null, TAB_ICONS[tab], label, n.classList.contains('active'), () => { close(); n.click(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
        if (!TAB_ICONS[tab]) it.querySelector('.mnav-ic').textContent = (n.querySelector('.ic') || {}).textContent || '';
        const badge = n.querySelector('.adm-badge');
        if (badge && !badge.hidden) it.append(el('span', { class: 'mnav-count' }, badge.textContent));
        group.append(it);
      });
    }

    const foot = el('div', { class: 'mnav-group' });
    if (me) foot.append(item(null, 'logout', 'ออกจากระบบ', false, logout));
    else {
      foot.append(item('/login.html', 'login', 'เข้าสู่ระบบ', path === '/login.html'));
      foot.append(item('/register.html', 'userplus', 'สมัครสมาชิก', path === '/register.html'));
    }
    panel.append(foot);
  };

  const open = () => { build(); panel.hidden = false; btn.classList.add('open'); btn.innerHTML = navIcon('close'); btn.setAttribute('aria-expanded', 'true'); btn.setAttribute('aria-label', 'ปิดเมนู'); };
  const close = () => { panel.hidden = true; btn.classList.remove('open'); btn.innerHTML = navIcon('menu'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'เปิดเมนู'); };
  btn.onclick = (e) => { e.stopPropagation(); if (panel.hidden) open(); else close(); };
  panel.onclick = (e) => e.stopPropagation();
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  window.addEventListener('resize', () => { if (!panel.hidden && window.innerWidth > 900) close(); });
  return wrap;
}

function mountFooter() {
  if (document.querySelector('footer.site-footer')) return;
  const f = el('footer', { class: 'site-footer' });
  f.innerHTML = `
    <div class="sf-inner">
      <div class="sf-brand"><span class="pill-logo-mark">◆</span><div><b>Donate Stream</b><span>แพลตฟอร์มโดเนทสำหรับสตรีมเมอร์ไทย</span></div></div>
      <nav class="sf-links">
        <a href="/">หน้าแรก</a><a href="/streamers.html">สตรีมเมอร์</a><a href="/plans.html">แพลน</a><a href="/topup.html">เติมเงิน</a><a href="/dashboard.html">แดชบอร์ด</a>
      </nav>
      <div class="sf-copy">© ${new Date().getFullYear() + 543} Donate Stream · สงวนลิขสิทธิ์</div>
    </div>`;
  document.body.append(f);
}

// ---------- สลิปการโอนเงินคำขอถอน: เปิดดู + ส่งออกเป็น PDF ----------
// p = แถวคำขอถอน { id, amount, account_detail, status, note, created_at, processed_at, username? }
const PAYOUT_STATUS_TH = { pending: 'รอดำเนินการ', paid: 'โอนแล้ว', rejected: 'ปฏิเสธ' };

function openSlipViewer(p, slipUrl) {
  if (!window.Swal) return window.open(slipUrl, '_blank');
  Swal.fire({
    title: 'สลิปการโอนเงิน', imageUrl: slipUrl, imageAlt: 'สลิปการโอนเงิน',
    html: `<a href="${slipUrl}" target="_blank" rel="noopener">เปิดรูปเต็มในแท็บใหม่</a>`,
    showDenyButton: true, denyButtonText: '⬇ ดาวน์โหลด PDF', confirmButtonText: 'ปิด',
    customClass: { image: 'slip-img', denyButton: 'slip-pdf-btn' },
    preDeny: () => exportSlipPdf(p, slipUrl).then(() => false),
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('อ่านไฟล์สลิปไม่สำเร็จ'));
    r.readAsDataURL(blob);
  });
}

// สร้าง PDF A4: หัวเอกสาร + รายละเอียดคำขอถอน + รูปสลิป
// (เรนเดอร์ HTML เป็นรูปด้วย html2canvas ก่อน เพราะฟอนต์ของ jsPDF ไม่รองรับภาษาไทย)
async function exportSlipPdf(p, slipUrl) {
  if (!window.jspdf || !window.html2canvas) return toast('โหลดเครื่องมือสร้าง PDF ไม่สำเร็จ (ตรวจการเชื่อมต่ออินเทอร์เน็ต)', false);
  let slipData;
  try {
    const res = await fetch(slipUrl);
    if (!res.ok) throw new Error('ไม่พบสลิป');
    slipData = await blobToDataUrl(await res.blob());
  } catch (e) { return toast('โหลดสลิปไม่สำเร็จ: ' + e.message, false); }

  const dt = (ts) => (ts ? new Date(ts).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' }) + ' น.' : '-');
  const money = Number(p.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rows = [
    ['เลขที่คำขอถอน', '#' + p.id],
    ...(p.username ? [['ผู้ถอน', '@' + p.username]] : []),
    ['จำนวนเงิน', money + ' บาท'],
    ['ถอนไปยัง', p.account_detail || '-'],
    ['วันที่ขอถอน', dt(p.created_at)],
    ['วันที่โอน', dt(p.processed_at)],
    ['สถานะ', PAYOUT_STATUS_TH[p.status] || p.status],
    ...(p.note ? [['หมายเหตุ', p.note]] : []),
  ];
  const cell = 'padding:8px 10px;border:1px solid #e5e7eb;font-size:14px;vertical-align:top';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;color:#111;padding:36px 40px;font-family:"IBM Plex Sans Thai","Segoe UI",Tahoma,sans-serif;box-sizing:border-box';
  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:18px">
      <div><div style="font-size:24px;font-weight:800">หลักฐานการโอนเงิน</div><div style="font-size:13px;color:#555">การถอนรายได้ · Donate Stream</div></div>
      <div style="font-size:12px;color:#666;text-align:right">ส่งออกเมื่อ<br>${esc(dt(Date.now()))}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      ${rows.map(([k, v]) => `<tr><td style="${cell};width:150px;background:#f6f7f9;color:#444">${esc(k)}</td><td style="${cell};font-weight:600">${esc(v)}</td></tr>`).join('')}
    </table>
    <div style="font-size:14px;font-weight:700;margin-bottom:8px">สลิปการโอนเงิน</div>
    <div style="text-align:center;border:1px solid #e5e7eb;border-radius:8px;padding:10px"><img src="${slipData}" style="max-width:100%;max-height:620px"></div>`;
  document.body.append(wrap);
  try {
    await new Promise((r) => { const im = wrap.querySelector('img'); if (im.complete) r(); else { im.onload = r; im.onerror = r; } });
    const canvas = await html2canvas(wrap, { scale: 2, backgroundColor: '#ffffff' });
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
    // ย่อให้พอดี 1 หน้า A4
    const scale = Math.min(pageW / canvas.width, pageH / canvas.height);
    const w = canvas.width * scale, h = canvas.height * scale;
    doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pageW - w) / 2, 0, w, h);
    doc.save(`slip-payout-${p.id}.pdf`);
    toast('ดาวน์โหลด PDF แล้ว');
  } catch (e) {
    toast('สร้าง PDF ไม่สำเร็จ: ' + e.message, false);
  } finally {
    wrap.remove();
  }
}
