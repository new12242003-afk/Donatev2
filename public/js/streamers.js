// หน้าสตรีมเมอร์ (Streamer Discovery): แนะนำวันนี้ + ทั้งหมด + ค้นหา + โปรไฟล์ (คลิกการ์ด)
let STREAMERS = [];
const FEATURED_COUNT = 5;
// "สตรีมเมอร์ทั้งหมด" แสดงกี่คนก่อนกด "ดูทั้งหมด" (กรอง/ค้นหาอยู่ = แสดงที่ตรงทั้งหมด)
const ALL_PREVIEW = 10;
let SHOW_ALL = false;

(async () => {
  const me = await getMe();
  mountNav(me);
  const [list, cats] = await Promise.all([
    api('/api/public/streamers').catch(() => []),
    api('/api/public/categories').catch(() => null),
  ]);
  STREAMERS = list;
  CATEGORIES = (cats && cats.categories) || [];
  const search = document.getElementById('slSearch');
  search.oninput = () => render(search.value);
  render('');
  initProfileModal();
  const rerender = () => {
    render(search.value);
    const open = !document.getElementById('spModal').hidden && STREAMERS.find((x) => x.username === OPEN_PROFILE);
    if (open) openProfile(open);
  };
  const refetch = async () => {
    const fresh = await api('/api/public/streamers').catch(() => null);
    if (fresh) { STREAMERS = fresh; rerender(); }
  };
  // สตรีมเมอร์แก้ตาราง / เริ่ม-หยุดไลฟ์ → อัปเดตการ์ดและโปรไฟล์ที่เปิดอยู่ทันที
  watchLive((d) => {
    const x = STREAMERS.find((s) => s.username === d.username);
    if (!x) return;
    x.live = d.live;
    rerender();
  }, refetch);
  // สตรีมเมอร์แก้โปรไฟล์ (ชื่อ / รูป / ปก / bio / หมวด / โซเชียล) → อัปเดตทันที; คนใหม่ที่ยังไม่อยู่ในรายการ → ดึงรายชื่อใหม่
  watchProfiles((d) => {
    const x = STREAMERS.find((s) => s.username === d.username);
    if (!x) { refetch(); return; }
    Object.assign(x, d.profile);
    rerender();
  });
  // ทุกนาที: ให้นับถอยหลังเดิน + ดึงรายชื่อใหม่ (กันพลาด) — หยุดตอนแท็บถูกซ่อน
  setInterval(() => { if (!document.hidden) refetch(); }, 60000);
  // ดูทั้งหมด: ล้างตัวกรอง/คำค้น แล้วแสดงสตรีมเมอร์ในระบบทุกคน
  document.getElementById('seeAll').onclick = () => {
    SHOW_ALL = true;
    search.value = '';
    LIVE_ONLY = false;
    setFilter('');
    document.getElementById('allSec').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
})();

// ตัวเลขคงที่จากข้อความ — ใช้เลือกสีปกการ์ด/การ์ดหมวดย่อย ให้แต่ละคนสีเดิมทุกครั้ง
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// แนะนำ: สุ่มใหม่ทุกครั้งที่เปิดหน้า แต่คงลำดับไว้ตลอดการเปิดดู (อัปเดต realtime / ดึงรายชื่อใหม่ไม่สลับชุด)
// คนที่เพิ่งเข้ามาใหม่ได้ค่าสุ่มของตัวเองตอนเจอครั้งแรก
const FEATURED_RANK = new Map();
function featuredToday() {
  STREAMERS.forEach((x) => { if (!FEATURED_RANK.has(x.username)) FEATURED_RANK.set(x.username, Math.random()); });
  return STREAMERS.slice().sort((a, b) => FEATURED_RANK.get(a.username) - FEATURED_RANK.get(b.username)).slice(0, FEATURED_COUNT);
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
  if (x.creator_category) {
    // กดป้ายหมวดบนการ์ด = กรองหมวดนั้น
    const cat = el('button', { type: 'button', class: 'sd-cat', title: 'ดูสตรีมเมอร์หมวด ' + x.creator_category }, x.creator_category);
    cat.onclick = (e) => { e.stopPropagation(); setFilter(x.creator_category); document.getElementById('allSec').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    cover.append(cat);
  }
  // ป้ายสถานะทุกการ์ด: LIVE (แดง) / ออฟไลน์ (เทา)
  const isLive = !!(x.live && x.live.live);
  cover.append(el('span', { class: 'sd-live' + (isLive ? '' : ' off') }, el('i'), isLive ? 'LIVE' : 'ออฟไลน์'));
  c.append(cover, avatarEl(x, 'sd-avatar'));

  const body = el('div', { class: 'sd-body' }, el('div', { class: 'sd-name' }, name));
  // หมวดย่อย แถวเดียว ไม่ตัดคำ: แสดงเท่าที่ใส่ได้เต็มคำ ที่เหลือรวมเป็น "+N" (เดสก์ท็อป: 2 อันถ้ามีแค่ 2, ไม่งั้น 1 + "+N" · มือถือ: 1 + "+N")
  const subs = subsOf(x);
  if (subs.length && x.creator_category) {
    const catInfo = CATEGORIES.find((c) => c.name === x.creator_category) || {};
    const row = el('div', { class: 'sd-subs' });
    const narrow = window.matchMedia('(max-width: 520px)').matches;
    const shown = !narrow && subs.length <= 2 ? subs.length : 1;
    subs.slice(0, shown).forEach((s) => {
      const img = catInfo.images && catInfo.images[s];
      const ic = img ? el('img', { class: 'sd-sub-ic', src: img, alt: '', loading: 'lazy' })
        : el('span', { class: 'sd-sub-ic emoji' }, (catInfo.icons && catInfo.icons[s]) || '•');
      const t = el('button', { type: 'button', class: 'sd-sub', title: `ดูสตรีมเมอร์ ${x.creator_category} › ${s}` }, ic, s);
      t.onclick = (e) => { e.stopPropagation(); setFilter(x.creator_category, s); document.getElementById('allSec').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      row.append(t);
    });
    if (subs.length > shown) row.append(el('span', { class: 'sd-sub more', title: subs.slice(shown).join(', ') }, '+' + (subs.length - shown)));
    body.append(row);
  }
  // ออฟไลน์: กล่อง "ไลฟ์ถัดไป" (หัวข้อเล็ก + เวลาตัวหนา + นับถอยหลัง) แยกจากป้ายหมวดย่อยให้อ่านง่าย
  const sub = liveSubText(x.live);
  if (sub) {
    const box = el('div', { class: 'sd-next', title: sub });
    const m = sub.match(/^(ไลฟ์ถัดไป): (.+)$/);
    // แยก "วันนี้" กับ "18:20–23:00 น." — การ์ดแคบ (มือถือ) จะขึ้นบรรทัดใหม่ระหว่างวันกับเวลา ไม่ตัดกลางเวลา
    const parts = m && m[2].match(/^(.+?) (\d\d:\d\d–\d\d:\d\d น\.)$/);
    const time = parts ? [el('span', { class: 'nowrap' }, parts[1]), ' ', el('span', { class: 'nowrap' }, parts[2])] : [m && m[2]];
    if (m) box.append(el('div', { class: 'sd-next-time' }, '📅 ', ...time));
    else box.append(el('div', { class: 'sd-next-time small' }, sub));
    const count = liveCountdownEl(x.live, 'sd-live-count', true);
    if (count) box.append(count);
    body.append(box);
  }
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

// ---------- ตัวกรอง: แถบหมวดหลัก (แบบ Twitch) + การ์ดหมวดย่อย + สวิตช์ "กำลังไลฟ์" ----------
// รายการหมวด/หมวดย่อย/ไอคอนมาจาก /api/public/categories (src/categories.js)
let CATEGORIES = [];
// จำตัวกรองไว้ใน URL (?cat=เกม&sub=Roblox&live=1) — แชร์ลิงก์ได้ / กดย้อนกลับแล้วยังอยู่ที่เดิม
const QS = new URLSearchParams(location.search);
let FILTER_CAT = QS.get('cat') === 'live' ? '' : QS.get('cat') || '';   // '' = ทุกหมวด (?cat=live = ลิงก์รุ่นก่อน)
let FILTER_SUB = FILTER_CAT ? QS.get('sub') || '' : '';
let LIVE_ONLY = QS.get('live') === '1' || QS.get('cat') === 'live';

const isLiveNow = (x) => !!(x.live && x.live.live);
const subsOf = (x) => x.creator_subcategories || [];

// ไอคอนเส้นของหมวดหลัก (ด้านขวาของปุ่ม) — หมวดที่ไม่มีในนี้ใช้รูปดาว
const CAT_ICONS = {
  เกม: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r="1"/><circle cx="18" cy="13.8" r="1"/>',
  ไลฟ์สไตล์: '<path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 2.5c-.8 1 .8 2 0 3.5M12 2.5c-.8 1 .8 2 0 3.5"/>',
  เพลงและดีเจ: '<path d="M3.5 14v-2a8.5 8.5 0 0 1 17 0v2"/><rect x="2.5" y="14" width="5" height="7" rx="2"/><rect x="16.5" y="14" width="5" height="7" rx="2"/>',
  สร้างสรรค์: '<path d="M12 2.5a9.5 9.5 0 1 0 0 19c1.4 0 2-1 2-2 0-1.6-1.4-2-1.4-3.4 0-1 .8-1.6 1.8-1.6h2.3a4.8 4.8 0 0 0 4.8-4.8C21.5 6 17.3 2.5 12 2.5z"/><circle cx="7.5" cy="11" r="1.3"/><circle cx="10" cy="6.8" r="1.3"/><circle cx="15" cy="6.8" r="1.3"/>',
  อีสปอร์ต: '<path d="M7 3.5h10v5a5 5 0 0 1-10 0v-5z"/><path d="M7 5.5H3.5a3.5 3.5 0 0 0 3.8 4M17 5.5h3.5a3.5 3.5 0 0 1-3.8 4"/><path d="M12 13.5v3.5M8 21h8l-1-4H9z"/>',
};
const STAR_ICON = '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>';
const svgIcon = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

// โทนสีการ์ดหมวดย่อย (น้ำเงิน–ม่วงของเว็บ) — เลือกจากชื่อหมวดย่อย ให้แต่ละใบสีคงเดิมทุกครั้ง
const SUB_GRADIENTS = [
  ['#1f3fd1', '#5b7cff'], ['#3730a3', '#818cf8'], ['#5b21b6', '#a78bfa'], ['#1e40af', '#38bdf8'],
  ['#312e81', '#6366f1'], ['#4c1d95', '#c084fc'], ['#0c4a6e', '#22d3ee'], ['#1e3a8a', '#8b5cf6'],
];

// ตรงกับตัวกรองที่เลือกอยู่ไหม (ข้ามบางเงื่อนไขได้ ไว้นับจำนวนบนปุ่ม)
function matchCurrent(x, { cat = FILTER_CAT, sub = FILTER_SUB, live = LIVE_ONLY } = {}) {
  return (!cat || x.creator_category === cat) && (!sub || subsOf(x).includes(sub)) && (!live || isLiveNow(x));
}

function setFilter(cat, sub = '') {
  FILTER_CAT = cat;
  FILTER_SUB = cat ? sub : '';
  syncFilterUrl();
}

function syncFilterUrl() {
  const url = new URL(location.href);
  const set = (k, v) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
  set('cat', FILTER_CAT); set('sub', FILTER_SUB); set('live', LIVE_ONLY ? '1' : '');
  history.replaceState(null, '', url);
  render(document.getElementById('slSearch').value);
}

// ปุ่มบนสุด: ทั้งหมด / กำลังไลฟ์ (สวิตช์ ใช้ร่วมกับหมวดได้)
function renderStatusBar() {
  const box = document.getElementById('sdStatus');
  box.innerHTML = '';
  const all = el('button', { type: 'button', class: 'sd-filter' + (!FILTER_CAT && !LIVE_ONLY ? ' active' : ''), 'aria-pressed': String(!FILTER_CAT && !LIVE_ONLY) },
    'ทั้งหมด', el('span', { class: 'sd-filter-n' }, String(STREAMERS.length)));
  all.onclick = () => { LIVE_ONLY = false; setFilter(''); };
  const liveN = STREAMERS.filter((x) => matchCurrent(x, { sub: '', live: true })).length;
  const live = el('button', { type: 'button', class: 'sd-filter live' + (LIVE_ONLY ? ' active' : ''), 'aria-pressed': String(LIVE_ONLY), title: 'แสดงเฉพาะคนที่กำลังไลฟ์' },
    el('i'), 'กำลังไลฟ์', el('span', { class: 'sd-filter-n' }, String(liveN)));
  live.onclick = () => { LIVE_ONLY = !LIVE_ONLY; syncFilterUrl(); };
  box.append(all, live);
}

// แถบหมวดหลัก: ปุ่มใหญ่ ชื่อซ้าย ไอคอนขวา — กดซ้ำ = กลับเป็นทุกหมวด
function renderCatBar() {
  const box = document.getElementById('sdCatBar');
  box.innerHTML = '';
  CATEGORIES.forEach((c) => {
    const on = FILTER_CAT === c.name;
    const n = STREAMERS.filter((x) => matchCurrent(x, { cat: c.name, sub: '' })).length;
    const b = el('button', { type: 'button', class: 'sd-cattile' + (on ? ' active' : ''), 'aria-pressed': String(on) },
      el('span', { class: 'sd-cattile-text' }, el('b', {}, c.name), el('small', {}, `${n} ${LIVE_ONLY ? 'กำลังไลฟ์' : 'คน'}`)),
      el('span', { class: 'sd-cattile-ic', html: svgIcon(CAT_ICONS[c.name] || STAR_ICON) }));
    b.onclick = () => setFilter(on ? '' : c.name);
    box.append(b);
  });
}

// "หมวดหมู่…ที่แนะนำ": การ์ดหมวดย่อยของหมวดที่เลือก — มีสตรีมเมอร์ขึ้นก่อน, ไม่มีใครแสดงจาง ๆ
function renderSubCards() {
  const sec = document.getElementById('sdSubSec');
  const cat = CATEGORIES.find((c) => c.name === FILTER_CAT);
  sec.hidden = !cat || !cat.subs.length;
  if (sec.hidden) return;
  document.getElementById('sdSubTitle').textContent = `หมวดหมู่${cat.name}ที่แนะนำ`;
  const count = (s) => STREAMERS.filter((x) => matchCurrent(x, { sub: s })).length;
  const subs = cat.subs.map((s) => ({ s, n: count(s) }));
  const sorted = [...subs.filter((x) => x.n), ...subs.filter((x) => !x.n)];
  const box = document.getElementById('sdSubGrid');
  box.innerHTML = '';
  sorted.forEach(({ s, n }) => {
    const on = FILTER_SUB === s;
    const [c1, c2] = SUB_GRADIENTS[hashStr(cat.name + s) % SUB_GRADIENTS.length];
    const art = el('span', { class: 'sd-subcard-art' });
    art.style.background = `linear-gradient(150deg, ${c1}, ${c2})`;
    const img = cat.images && cat.images[s];
    if (img) {
      // รูปเต็มกรอบการ์ด (รูปแนวนอนครอปด้านข้าง เหลือส่วนกลาง)
      art.classList.add('has-img');
      art.append(el('img', { class: 'sd-subcard-img', src: img, alt: '', loading: 'lazy' }));
    } else {
      art.append(el('span', { class: 'sd-subcard-emoji' }, (cat.icons && cat.icons[s]) || '⭐'));
    }
    if (n) art.append(el('span', { class: 'sd-subcard-n' }, `${n} ${LIVE_ONLY ? 'ไลฟ์' : 'คน'}`));
    const b = el('button', { type: 'button', class: 'sd-subcard' + (on ? ' active' : '') + (n ? '' : ' empty'), 'aria-pressed': String(on), title: s },
      art, el('span', { class: 'sd-subcard-name' }, s));
    b.onclick = () => setFilter(cat.name, on ? '' : s);
    box.append(b);
  });
}

// ค้นหาจากชื่อที่แสดง, username, หมวดหมู่/หมวดย่อย และคำอธิบายตัวตน (ไม่สนตัวพิมพ์เล็ก/ใหญ่, พิมพ์ @ นำหน้าได้) + ตัวกรองที่เลือก
function render(q) {
  const query = String(q || '').trim().toLowerCase().replace(/^@/, '');
  const found = STREAMERS.filter((x) => matchCurrent(x)).filter((x) => !query ||
    [x.display_name, x.username, x.creator_category, x.bio, ...subsOf(x)].some((v) => String(v || '').toLowerCase().includes(query)));
  // คนที่กำลังไลฟ์ขึ้นก่อน ที่เหลือเรียงตามเดิม
  const list = [...found.filter(isLiveNow), ...found.filter((x) => !isLiveNow(x))];
  const filtered = !!FILTER_CAT || LIVE_ONLY;
  renderStatusBar();
  renderCatBar();
  renderSubCards();

  const featSec = document.getElementById('featuredSec');
  featSec.hidden = !!query || filtered || !STREAMERS.length;
  const feat = document.getElementById('featured');
  feat.innerHTML = '';
  if (!featSec.hidden) featuredToday().forEach((x) => feat.append(card(x)));

  const catName = FILTER_CAT + (FILTER_SUB ? ' › ' + FILTER_SUB : '');
  const scope = [LIVE_ONLY ? 'กำลังไลฟ์' : '', FILTER_CAT ? 'หมวด ' + catName : ''].filter(Boolean).join(' · ');
  const title = FILTER_CAT ? catName : LIVE_ONLY ? 'กำลังไลฟ์ตอนนี้' : 'สตรีมเมอร์ทั้งหมด';
  document.getElementById('allTitle').textContent = query ? 'ผลการค้นหา' + (scope ? ' · ' + scope : '')
    : (FILTER_CAT && LIVE_ONLY ? 'กำลังไลฟ์ · ' : '') + title;
  // ไม่ได้กรอง/ค้นหา และยังไม่กด "ดูทั้งหมด" → แสดงแค่ ALL_PREVIEW คนแรก
  const limited = !query && !filtered && !SHOW_ALL && list.length > ALL_PREVIEW;
  const shown = limited ? list.slice(0, ALL_PREVIEW) : list;
  document.getElementById('slCount').textContent = query || filtered
    ? `พบ ${list.length} จาก ${STREAMERS.length} คน`
    : limited ? `All Streamers · แสดง ${shown.length} จาก ${STREAMERS.length} คน` : `All Streamers · ${STREAMERS.length} คน`;
  // ปุ่มดูทั้งหมด: มีเมื่อยังเห็นไม่ครบ (ตัดไว้ 10 คน หรือกำลังกรอง/ค้นหาอยู่)
  document.getElementById('seeAll').hidden = !(limited || query || filtered);

  const box = document.getElementById('streamers');
  box.innerHTML = '';
  shown.forEach((x) => box.append(card(x)));
  const empty = document.getElementById('slEmpty');
  empty.hidden = list.length > 0;
  if (!STREAMERS.length) empty.textContent = 'ยังไม่มีสตรีมเมอร์';
  else if (query) empty.textContent = `ไม่พบสตรีมเมอร์ที่ตรงกับ "${String(q).trim()}"` + (scope ? ` (${scope})` : '');
  else if (LIVE_ONLY) empty.textContent = `ตอนนี้ยังไม่มีสตรีมเมอร์${FILTER_CAT ? 'หมวด ' + catName + ' ' : ''}ที่กำลังไลฟ์ — ดูตารางไลฟ์ได้ในการ์ดของแต่ละคน`;
  else empty.textContent = `ยังไม่มีสตรีมเมอร์ในหมวด ${catName}`;
}

function initProfileModal() {
  const modal = document.getElementById('spModal');
  const close = () => { modal.hidden = true; };
  document.getElementById('spClose').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
}

let OPEN_PROFILE = null;

function openProfile(x) {
  OPEN_PROFILE = x.username;
  // รูปปกแบบเดียวกับบนการ์ด: รูปที่สตรีมเมอร์อัปโหลด หรือสีไล่เฉดตามชื่อผู้ใช้
  const cover = document.getElementById('spCover');
  cover.classList.toggle('has-img', !!x.cover_url);
  if (x.cover_url) {
    cover.style.background = '';
    cover.style.backgroundImage = `url("${x.cover_url}")`;
  } else {
    const [c1, c2] = COVER_GRADIENTS[hashStr(x.username) % COVER_GRADIENTS.length];
    cover.style.backgroundImage = '';
    cover.style.background = `linear-gradient(120deg, ${c1}, ${c2})`;
  }
  const av = document.getElementById('spAvatar');
  av.innerHTML = '';
  av.append(avatarEl(x, 'sp-avatar'));
  document.getElementById('spName').textContent = x.display_name || x.username;
  document.getElementById('spUser').textContent = '@' + x.username;
  const cat = document.getElementById('spCat');
  cat.innerHTML = '';
  cat.append(el('span', { class: 'pill' }, x.creator_category || 'ไม่ระบุหมวดหมู่'));
  if (x.creator_category) subsOf(x).forEach((s) => cat.append(el('span', { class: 'pill sp-sub' }, s)));

  const live = document.getElementById('spLive');
  live.innerHTML = '';
  const status = el('div', { class: 'sp-live' }, liveBadge(x.live));
  const sub = liveSubText(x.live);
  if (sub) status.append(el('span', { class: 'muted' }, sub));
  const count = liveCountdownEl(x.live);
  if (count) status.append(count);
  live.append(status);
  const sched = liveScheduleEl(x.live);
  live.append(sched || el('div', { class: 'muted' }, 'ยังไม่ได้ตั้งตารางไลฟ์'));

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
