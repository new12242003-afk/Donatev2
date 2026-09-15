let ME, STICKERS = [];

(async function () {
  ME = await getMe();
  if (!ME) { location.href = '/login.html'; return; }
  mountNav(ME);

  document.getElementById('bal').textContent = fmt(ME.token_balance);
  document.getElementById('acctUsername').value = ME.username || '';
  document.getElementById('acctEmail').value = ME.email || '';
  document.getElementById('dispName').value = ME.display_name || '';
  document.getElementById('dName').value = ME.display_name || ME.username;
  if (!ME.email_verified) document.getElementById('verifyWarn').style.display = '';
  if (ME.role === 'donor') document.getElementById('becomeStreamer').style.display = '';

  document.getElementById('acctDisplayName').textContent = ME.display_name || ME.username;
  document.getElementById('acctRoleLabel').textContent = '@' + ME.username + ' · ' + roleLabel(ME.role);
  renderAvatar();
  document.getElementById('p_first').value = ME.first_name || '';
  document.getElementById('p_last').value = ME.last_name || '';
  document.getElementById('p_nid').value = ME.national_id || '';
  document.getElementById('p_dob').value = ME.birth_date || '';
  document.getElementById('p_addr').value = ME.address_line || '';
  document.getElementById('p_subdistrict').value = ME.address_subdistrict || '';
  document.getElementById('p_district').value = ME.address_district || '';
  document.getElementById('p_province').value = ME.address_province || '';
  document.getElementById('p_zip').value = ME.address_zipcode || '';

  const cfg = await api('/api/public/config');
  const pkgBox = document.getElementById('pkgs');
  cfg.topup_packages.forEach((v) => {
    const b = el('button', { class: 'ghost sm' }, v + ' ฿');
    b.onclick = () => doTopup(v, 'mock');
    pkgBox.append(b);
  });

  const streamers = await api('/api/public/streamers');
  const sel = document.getElementById('dStreamer');
  streamers.filter((s) => s.username !== ME.username).forEach((s) => {
    sel.append(el('option', { value: s.username }, (s.display_name || s.username) + ' (@' + s.username + ')'));
  });
  const to = new URLSearchParams(location.search).get('to');
  if (to) sel.value = to;
  sel.onchange = () => logStreamerView(sel.value);
  logStreamerView(sel.value);

  STICKERS = await api('/api/public/stickers');
  const sp = document.getElementById('dStickers');
  STICKERS.forEach((st) => {
    const d = el('div', { class: 's' },
      el('span', { class: 'e' }, st.emoji || '⭐'),
      el('div', {}, st.name),
      el('div', { class: 'c' }, st.cost + ' ฿'));
    d.onclick = () => sendSticker(st, d);
    sp.append(d);
  });

  document.getElementById('topupGo').onclick = () =>
    doTopup(Number(document.getElementById('topupAmt').value), document.getElementById('topupMethod').value);
  document.getElementById('dGo').onclick = sendDonation;
  document.getElementById('becomeStreamer').onclick = async () => {
    await api('/api/me/become-streamer', { method: 'POST' });
    location.reload();
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
  document.getElementById('avatarInput').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return toast('ไฟล์ใหญ่เกินไป (สูงสุด 3MB)', false);
    try {
      const dataUrl = await resizeImage(file, 512);
      const r = await api('/api/me/avatar', { method: 'POST', body: { image: dataUrl } });
      ME.avatar_url = r.avatar_url;
      renderAvatar();
      toast('อัปเดตรูปโปรไฟล์แล้ว');
    } catch (err) { toast(err.message, false); }
  };
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
  if (ME.role === 'streamer' || ME.role === 'admin') initStreamer();
  initTabs();
})();

// ---------- sidebar navigation ----------
function initTabs() {
  const items = document.querySelectorAll('.sidebar-item');
  items.forEach((btn) => (btn.onclick = () => switchTab(btn.dataset.tab)));
  window.addEventListener('hashchange', () => switchTab(location.hash.slice(1)));
  switchTab(location.hash.slice(1));
}

function switchTab(tab) {
  const items = [...document.querySelectorAll('.sidebar-item')];
  let target = items.find((b) => b.dataset.tab === tab && b.style.display !== 'none');
  if (!target) target = items.find((b) => b.style.display !== 'none');
  tab = target.dataset.tab;

  items.forEach((b) => b.classList.toggle('active', b === target));
  document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = p.dataset.panel !== tab));
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

function resizeImage(file, maxSize) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const scale = maxSize / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('ไฟล์รูปภาพไม่ถูกต้อง'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

let lastLoggedView = null;
function logStreamerView(username) {
  if (!username || username === ME.username || username === lastLoggedView) return;
  lastLoggedView = username;
  api('/api/public/streamer-view', { method: 'POST', body: { username } }).catch(() => {});
}

async function sendSticker(sticker, node) {
  const streamer = document.getElementById('dStreamer').value;
  if (!streamer) return toast('เลือกสตรีมเมอร์ก่อน', false);
  if (node.classList.contains('sending')) return;
  document.querySelectorAll('#dStickers .s').forEach((n) => n.classList.add('sending'));
  try {
    const r = await api('/api/donate', {
      method: 'POST',
      body: {
        streamer,
        display_name: document.getElementById('dName').value,
        message: document.getElementById('dMsg').value,
        sticker_code: sticker.code,
        sticker_only: true,
      },
    });
    toast(`ส่ง ${sticker.emoji || ''} ${sticker.name} ไปหา @${streamer} สำเร็จ! 🎉`);
    document.getElementById('bal').textContent = fmt(r.balance);
    loadSent();
  } catch (e) { toast(e.message, false); }
  finally { document.querySelectorAll('#dStickers .s').forEach((n) => n.classList.remove('sending')); }
}

async function doTopup(amount, method) {
  if (!amount || amount < 20) return toast('ขั้นต่ำ 20 บาท', false);
  try {
    const r = await api('/api/topup', { method: 'POST', body: { amount_baht: amount, method } });
    const out = document.getElementById('topupOut');
    if (r.status === 'paid') {
      toast('เติมเงินสำเร็จ +' + r.tokens + ' Token');
      out.textContent = '';
      refreshBalance();
    } else {
      out.innerHTML = `รหัสอ้างอิง <b>${r.reference}</b> · ${esc(r.payment.note)} `
        + `<button class="sm" id="confirmPay">ยืนยันการชำระ</button>`;
      document.getElementById('confirmPay').onclick = async () => {
        const c = await api('/api/topup/' + r.reference + '/confirm', { method: 'POST' });
        toast('เติมเงินสำเร็จ +' + c.tokens + ' Token');
        out.textContent = '';
        refreshBalance();
      };
    }
  } catch (e) { toast(e.message, false); }
}

async function refreshBalance() {
  ME = await getMe();
  document.getElementById('bal').textContent = fmt(ME.token_balance);
  const e1 = document.getElementById('earn'); if (e1) e1.textContent = fmt(ME.earnings_balance);
  const e2 = document.getElementById('earn2'); if (e2) e2.textContent = fmt(ME.earnings_balance);
}

async function sendDonation() {
  try {
    const body = {
      streamer: document.getElementById('dStreamer').value,
      amount: Number(document.getElementById('dAmount').value),
      display_name: document.getElementById('dName').value,
      message: document.getElementById('dMsg').value,
    };
    if (!body.streamer) return toast('เลือกสตรีมเมอร์ก่อน', false);
    const r = await api('/api/donate', { method: 'POST', body });
    toast(`ส่งโดเนทไปหา @${body.streamer} สำเร็จ! 🎉`);
    document.getElementById('bal').textContent = fmt(r.balance);
    document.getElementById('dMsg').value = '';
    loadSent();
  } catch (e) { toast(e.message, false); }
}

async function loadSent() {
  const rows = await api('/api/donate/sent').catch(() => []);
  document.getElementById('sentHist').innerHTML = rows.map((d) =>
    `<tr><td>${new Date(d.created_at).toLocaleString('th-TH')}</td><td>@${esc(d.streamer_username)}</td>`
    + `<td>${fmt(d.amount)} ฿</td><td>${esc(d.sticker_code || '-')}</td><td>${esc(d.message || '')}</td></tr>`
  ).join('') || '<tr><td colspan="5" class="muted">ยังไม่มีรายการ</td></tr>';
}

// ---------- streamer ----------
async function initStreamer() {
  document.getElementById('navSettings').style.display = '';
  document.getElementById('navEarnings').style.display = '';
  document.getElementById('navStats').style.display = '';
  document.getElementById('navLeaderboard').style.display = '';
  document.getElementById('earnBox').style.display = '';
  document.getElementById('earn').textContent = fmt(ME.earnings_balance);
  document.getElementById('earn2').textContent = fmt(ME.earnings_balance);

  const d = await api('/api/streamer/settings');
  const s = d.settings;
  const url = location.origin + d.overlay_url;
  document.getElementById('overlayUrl').textContent = url;
  document.getElementById('openOverlay').href = d.overlay_url;
  document.getElementById('copyOverlay').onclick = () => { navigator.clipboard.writeText(url); toast('คัดลอกแล้ว'); };
  document.getElementById('rotateOverlay').onclick = async () => {
    const r = await api('/api/streamer/overlay/rotate', { method: 'POST' });
    const u = location.origin + r.overlay_url;
    document.getElementById('overlayUrl').textContent = u;
    document.getElementById('openOverlay').href = r.overlay_url;
    toast('สร้าง URL ใหม่แล้ว');
  };

  const set = (id, v) => (document.getElementById(id).value = v);
  set('s_dur', s.alert_duration_ms); set('s_minalert', s.min_alert_amount);
  set('s_min', s.min_donation); set('s_max', s.max_donation);
  set('s_accent', s.accent_color); set('s_text', s.text_color);
  set('s_bg', s.bg_color); set('s_title', s.title_template);
  document.getElementById('s_sound').checked = !!s.sound_enabled;
  document.getElementById('s_tts').checked = !!s.tts_enabled;

  document.getElementById('saveSettings').onclick = async () => {
    try {
      await api('/api/streamer/settings', {
        method: 'PUT',
        body: {
          alert_duration_ms: +document.getElementById('s_dur').value,
          min_alert_amount: +document.getElementById('s_minalert').value,
          min_donation: +document.getElementById('s_min').value,
          max_donation: +document.getElementById('s_max').value,
          accent_color: document.getElementById('s_accent').value,
          text_color: document.getElementById('s_text').value,
          bg_color: document.getElementById('s_bg').value,
          title_template: document.getElementById('s_title').value,
          sound_enabled: document.getElementById('s_sound').checked,
          tts_enabled: document.getElementById('s_tts').checked,
        },
      });
      toast('บันทึกการตั้งค่าแล้ว');
    } catch (e) { toast(e.message, false); }
  };

  const ts = document.getElementById('tSticker');
  ts.append(el('option', { value: '' }, '— ไม่มีสติกเกอร์ —'));
  (STICKERS.length ? STICKERS : await api('/api/public/stickers')).forEach((x) =>
    ts.append(el('option', { value: x.code }, (x.emoji || '⭐') + ' ' + x.name)));
  document.getElementById('tGo').onclick = async () => {
    await api('/api/streamer/test-alert', {
      method: 'POST',
      body: {
        amount: +document.getElementById('tAmount').value,
        display_name: document.getElementById('tName').value,
        sticker_code: ts.value || undefined,
      },
    });
    toast('ส่งทดสอบไปที่ Overlay แล้ว');
  };

  document.getElementById('pGo').onclick = async () => {
    try {
      await api('/api/streamer/payout', {
        method: 'POST',
        body: {
          amount: +document.getElementById('pAmount').value,
          account_detail: document.getElementById('pAcc').value,
        },
      });
      toast('ส่งคำขอถอนเงินแล้ว');
      refreshBalance();
      loadStreamerHist();
    } catch (e) { toast(e.message, false); }
  };

  loadStreamerHist();
  initStats();
}

async function loadStreamerHist() {
  const sum = await api('/api/streamer/summary').catch(() => ({ recent: [] }));
  document.getElementById('recvHist').innerHTML = (sum.recent || []).map((d) =>
    `<tr><td>${new Date(d.created_at).toLocaleString('th-TH')}</td><td>${esc(d.display_name)}</td>`
    + `<td>${fmt(d.amount)} ฿</td><td>${fmt(d.streamer_credit)}</td><td>${esc(d.message || '')}</td></tr>`
  ).join('') || '<tr><td colspan="5" class="muted">ยังไม่มีรายการ</td></tr>';

  const p = await api('/api/streamer/payouts').catch(() => []);
  document.getElementById('payoutHist').innerHTML = p.map((x) =>
    `<tr><td>${new Date(x.created_at).toLocaleString('th-TH')}</td><td>${fmt(x.amount)}</td><td>${esc(x.status)}</td></tr>`
  ).join('') || '<tr><td colspan="3" class="muted">ยังไม่มีรายการ</td></tr>';
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
  renderTopDonors(analyticsCache.top_donors);
}

function renderStatTiles(t) {
  const tiles = [
    { label: `รายได้ (${currentDays} วันล่าสุด)`, value: fmt(t.revenue_period) + ' ฿' },
    { label: `จำนวนโดเนท (${currentDays} วันล่าสุด)`, value: fmt(t.donations_period) },
    { label: `ผู้เข้าชม (${currentDays} วันล่าสุด)`, value: fmt(t.views_period) },
    { label: 'อัตราการโดเนท (โดเนท/ผู้เข้าชม)', value: t.rate_period + '%' },
    { label: 'รายได้สะสมทั้งหมด', value: fmt(t.revenue_lifetime) + ' ฿' },
    { label: 'จำนวนโดเนททั้งหมด', value: fmt(t.donations_lifetime) },
  ];
  const box = document.getElementById('statTiles');
  box.innerHTML = '';
  tiles.forEach((x) => {
    box.append(el('div', { class: 'stat-tile' }, el('div', { class: 'label' }, x.label), el('div', { class: 'value' }, x.value)));
  });
}

function renderTopDonors(list) {
  document.getElementById('donorRank').innerHTML = (list || []).map((d, i) =>
    `<tr><td>${i + 1}</td><td>${esc(d.display_name || '-')}${d.username ? ' <span class="muted">@' + esc(d.username) + '</span>' : ''}</td>`
    + `<td>${fmt(d.total)} ฿</td><td>${fmt(d.count)}</td></tr>`
  ).join('') || '<tr><td colspan="4" class="muted">ยังไม่มีข้อมูล</td></tr>';
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
    line.setAttribute('stroke', '#26262a'); line.setAttribute('stroke-width', '1');
    svg.append(line);
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', padL - 6); label.setAttribute('y', y + 4);
    label.setAttribute('text-anchor', 'end'); label.setAttribute('font-size', '10');
    label.setAttribute('fill', '#96969e');
    label.textContent = fmt(Math.round(yMax * f));
    svg.append(label);
  });

  const labelEvery = n <= 7 ? 1 : n <= 14 ? 2 : 5;
  trend.forEach((t, i) => {
    if (i % labelEvery !== 0 && i !== n - 1) return;
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', xAt(i)); label.setAttribute('y', H - 6);
    label.setAttribute('text-anchor', 'middle'); label.setAttribute('font-size', '10');
    label.setAttribute('fill', '#96969e');
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
  area.setAttribute('fill', 'rgba(255,255,255,.08)');
  svg.append(area);

  let lineD = `M ${points[0].x},${points[0].y} `;
  points.slice(1).forEach((p) => { lineD += `L ${p.x},${p.y} `; });
  const line = document.createElementNS(svgNS, 'path');
  line.setAttribute('d', lineD);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', '#ffffff');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-linejoin', 'round');
  line.setAttribute('stroke-linecap', 'round');
  svg.append(line);

  const last = points[n - 1];
  const dot = document.createElementNS(svgNS, 'circle');
  dot.setAttribute('cx', last.x); dot.setAttribute('cy', last.y); dot.setAttribute('r', 5);
  dot.setAttribute('fill', '#ffffff'); dot.setAttribute('stroke', '#141416'); dot.setAttribute('stroke-width', '2');
  svg.append(dot);

  const endLabel = document.createElementNS(svgNS, 'text');
  const above = last.y > padT + 16;
  endLabel.setAttribute('x', last.x); endLabel.setAttribute('y', above ? last.y - 10 : last.y + 18);
  endLabel.setAttribute('text-anchor', last.x > W - 60 ? 'end' : 'middle');
  endLabel.setAttribute('font-size', '12'); endLabel.setAttribute('font-weight', '700');
  endLabel.setAttribute('fill', '#f3f3f5');
  endLabel.textContent = fmtMetricValue(metric, last.t[metric]);
  svg.append(endLabel);

  const crosshair = document.createElementNS(svgNS, 'line');
  crosshair.setAttribute('y1', padT); crosshair.setAttribute('y2', padT + plotH);
  crosshair.setAttribute('stroke', '#96969e'); crosshair.setAttribute('stroke-width', '1');
  crosshair.setAttribute('opacity', '0');
  svg.append(crosshair);

  const hoverDot = document.createElementNS(svgNS, 'circle');
  hoverDot.setAttribute('r', 5); hoverDot.setAttribute('fill', '#ffffff');
  hoverDot.setAttribute('stroke', '#141416'); hoverDot.setAttribute('stroke-width', '2');
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
