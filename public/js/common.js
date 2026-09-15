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

function toast(msg, ok = true) {
  const t = el('div', { class: 'toast ' + (ok ? 'ok' : 'err') }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3500);
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
  topup: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>',
  admin: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/>',
};

function navIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${NAV_ICONS[name] || ''}</svg>`;
}

function navLink(href, icon, label, active) {
  const a = el('a', { href, class: 'pill-item' + (active ? ' active' : '') });
  a.append(el('span', { class: 'pill-item-ic', html: navIcon(icon) }), el('span', {}, label));
  return a;
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
  if (me) items.append(navLink('/topup.html', 'topup', 'เติมเงิน', path === '/topup.html'));
  if (me && me.role === 'admin') items.append(navLink('/admin.html', 'admin', 'แอดมิน', path === '/admin.html'));
  nav.append(items);

  nav.append(el('div', { class: 'sp' }));
  if (me) {
    const chip = el('a', { href: '/dashboard.html', class: 'user-chip', title: 'ไปที่แดชบอร์ด' });
    chip.append(me.avatar_url
      ? el('img', { class: 'user-chip-avatar', src: me.avatar_url, alt: '' })
      : el('span', { class: 'user-chip-avatar user-chip-fallback' },
          (me.display_name || me.username || '?').trim().charAt(0).toUpperCase()));
    chip.append(el('span', { class: 'user-chip-text' },
      el('span', { class: 'user-chip-name' }, me.display_name || me.username),
      el('span', { class: 'user-chip-role' }, roleLabel(me.role))));
    nav.append(chip);

    const b = el('button', { class: 'pill-auth' }, 'ออกจากระบบ');
    b.onclick = logout;
    nav.append(b);
  } else {
    nav.append(el('a', { href: '/login.html', class: 'pill-auth' }, 'เข้าสู่ระบบ'));
    nav.append(el('a', { href: '/register.html', class: 'pill-auth pill-auth-primary' }, 'สมัครสมาชิก'));
  }
  document.body.prepend(nav);
}
