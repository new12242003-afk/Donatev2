// หน้าสตรีมเมอร์ (Streamer Discovery): แนะนำวันนี้ + ทั้งหมด + ค้นหา + โปรไฟล์ (คลิกการ์ด)
let STREAMERS = [];
const FEATURED_COUNT = 5;

(async () => {
  const me = await getMe();
  mountNav(me);
  STREAMERS = await api('/api/public/streamers').catch(() => []);
  const search = document.getElementById('slSearch');
  search.oninput = () => render(search.value);
  render('');
  initProfileModal();
  document.getElementById('seeAll').onclick = (e) => {
    e.preventDefault();
    document.getElementById('allSec').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
})();

// ตัวเลขคงที่จากข้อความ — ใช้สุ่มสีปกการ์ดและลำดับ "แนะนำวันนี้" ให้เหมือนเดิมทั้งวัน
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// แนะนำวันนี้: เรียงตามค่า hash(วันที่ + username) → เปลี่ยนชุดทุกวัน แต่ทุกคนที่เปิดวันเดียวกันเห็นเหมือนกัน
function featuredToday() {
  const day = new Date().toISOString().slice(0, 10);
  return STREAMERS.slice().sort((a, b) => hashStr(day + a.username) - hashStr(day + b.username)).slice(0, FEATURED_COUNT);
}

const COVER_GRADIENTS = [
  ['#1f3fd1', '#5b7cff'], ['#7c3aed', '#c084fc'], ['#0f766e', '#2dd4bf'], ['#be185d', '#f472b6'],
  ['#b45309', '#fbbf24'], ['#1e293b', '#475569'], ['#0369a1', '#38bdf8'], ['#15803d', '#86efac'],
];

function avatarEl(x, cls) {
  return x.avatar_url
    ? el('img', { class: cls, src: x.avatar_url, alt: '' })
    : el('span', { class: cls + ' streamer-avatar-fallback' }, (x.display_name || x.username || '?').trim().charAt(0).toUpperCase());
}

function socialItems(x) {
  return SOCIAL_PLATFORMS.filter((p) => x.social_links && /^https?:\/\//i.test(x.social_links[p.key] || ''));
}

function card(x) {
  const name = x.display_name || x.username;
  const [c1, c2] = COVER_GRADIENTS[hashStr(x.username) % COVER_GRADIENTS.length];
  const c = el('div', { class: 'sd-card', role: 'button', tabindex: '0', 'aria-label': 'ดูโปรไฟล์ ' + name });

  const cover = el('div', { class: 'sd-cover' });
  if (x.cover_url) {
    cover.style.backgroundImage = `url("${x.cover_url}")`;
    cover.classList.add('has-img');
  } else {
    cover.style.background = `linear-gradient(120deg, ${c1}, ${c2})`;
    cover.append(el('span', { class: 'sd-cover-mark' }, '◆'));
  }
  if (x.creator_category) cover.append(el('span', { class: 'sd-cat' }, x.creator_category));
  c.append(cover, avatarEl(x, 'sd-avatar'));

  const body = el('div', { class: 'sd-body' }, el('div', { class: 'sd-name' }, name));
  if (x.bio) body.append(el('div', { class: 'sd-bio' }, x.bio));
  const socials = socialItems(x).slice(0, 3);
  if (socials.length) {
    const row = el('div', { class: 'sd-socials' });
    socials.forEach((p) => {
      const a = el('a', { class: 'sd-chip', href: x.social_links[p.key], target: '_blank', rel: 'noopener noreferrer nofollow' });
      a.append(el('span', { class: 'sd-chip-ic', html: socialIcon(p.key) }), el('span', {}, p.label));
      a.onclick = (e) => e.stopPropagation();
      row.append(a);
    });
    body.append(row);
  }
  c.append(body);

  c.onclick = () => openProfile(x);
  c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProfile(x); } };
  return c;
}

// ค้นหาจากชื่อที่แสดง, username, หมวดหมู่ และคำอธิบายตัวตน (ไม่สนตัวพิมพ์เล็ก/ใหญ่, พิมพ์ @ นำหน้าได้)
function render(q) {
  const query = String(q || '').trim().toLowerCase().replace(/^@/, '');
  const list = !query ? STREAMERS : STREAMERS.filter((x) =>
    [x.display_name, x.username, x.creator_category, x.bio].some((v) => String(v || '').toLowerCase().includes(query)));

  const featSec = document.getElementById('featuredSec');
  featSec.hidden = !!query || !STREAMERS.length;
  const feat = document.getElementById('featured');
  feat.innerHTML = '';
  if (!featSec.hidden) featuredToday().forEach((x) => feat.append(card(x)));

  document.getElementById('allTitle').textContent = query ? 'ผลการค้นหา' : 'สตรีมเมอร์ทั้งหมด';
  document.getElementById('slCount').textContent = query
    ? `พบ ${list.length} จาก ${STREAMERS.length} คน`
    : `All Streamers · ${STREAMERS.length} คน`;

  const box = document.getElementById('streamers');
  box.innerHTML = '';
  list.forEach((x) => box.append(card(x)));
  const empty = document.getElementById('slEmpty');
  empty.hidden = list.length > 0;
  empty.textContent = STREAMERS.length ? `ไม่พบสตรีมเมอร์ที่ตรงกับ "${String(q).trim()}"` : 'ยังไม่มีสตรีมเมอร์';
}

function initProfileModal() {
  const modal = document.getElementById('spModal');
  const close = () => { modal.hidden = true; };
  document.getElementById('spClose').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
}

function openProfile(x) {
  const av = document.getElementById('spAvatar');
  av.innerHTML = '';
  av.append(avatarEl(x, 'sp-avatar'));
  document.getElementById('spName').textContent = x.display_name || x.username;
  document.getElementById('spUser').textContent = '@' + x.username;
  const cat = document.getElementById('spCat');
  cat.innerHTML = '';
  cat.append(el('span', { class: 'pill' }, x.creator_category || 'ไม่ระบุหมวดหมู่'));

  const bio = document.getElementById('spBio');
  bio.className = x.bio ? 'sp-bio' : 'sp-bio muted';
  bio.textContent = x.bio || 'ยังไม่ได้เขียนคำอธิบายตัวตน';

  const links = document.getElementById('spLinks');
  links.innerHTML = '';
  const items = socialItems(x);
  if (!items.length) links.append(el('div', { class: 'muted' }, 'ยังไม่ได้เพิ่มลิงก์'));
  else {
    const wrap = el('div', { class: 'sp-links' });
    items.forEach((p) => {
      const a = el('a', { class: 'sp-link', href: x.social_links[p.key], target: '_blank', rel: 'noopener noreferrer nofollow' });
      a.append(el('span', { class: 'sp-link-ic', html: socialIcon(p.key) }), el('span', {}, p.label));
      wrap.append(a);
    });
    links.append(wrap);
  }

  document.getElementById('spDonate').href = '/u/' + encodeURIComponent(x.username);
  document.getElementById('spModal').hidden = false;
}
