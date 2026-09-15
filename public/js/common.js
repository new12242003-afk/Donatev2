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

function mountNav(me) {
  const nav = el('header', { class: 'nav' });
  nav.append(el('a', { href: '/', class: 'brand' }, '◆ Donate Stream'));
  if (me && me.role === 'admin') nav.append(el('a', { href: '/admin.html' }, 'แอดมิน'));
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

    const b = el('button', { class: 'ghost sm' }, 'ออกจากระบบ');
    b.onclick = logout;
    nav.append(b);
  } else {
    nav.append(el('a', { href: '/login.html' }, 'เข้าสู่ระบบ'));
    nav.append(el('a', { href: '/register.html' }, 'สมัครสมาชิก'));
  }
  document.body.prepend(nav);
}
