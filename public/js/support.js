// ติดต่อแอดมิน — ใช้ทั้งในแดชบอร์ด (ผู้ใช้) และหน้าแอดมิน: รายการเรื่อง + หน้าแชท + ส่งข้อความ (อัปเดตแบบ realtime)
const SUP_STATUS = { open: ['รอแอดมินตอบ', 'wait'], answered: ['แอดมินตอบแล้ว', 'on'], closed: ['ปิดเรื่องแล้ว', ''] };
const SUP_STATUS_ADMIN = { open: ['รอตอบ', 'wait'], answered: ['ตอบแล้ว', 'on'], closed: ['ปิดแล้ว', ''] };

function initSupport({ admin = false } = {}) {
  const root = document.getElementById('supportRoot');
  if (!root) return;
  const S = { admin, list: [], current: null, filter: admin ? 'active' : 'all', categories: [] };
  const base = admin ? '/api/support/admin' : '/api/support/tickets';
  const LABEL = admin ? SUP_STATUS_ADMIN : SUP_STATUS;

  root.innerHTML = `
    <div class="sup">
      <div class="card sup-side">
        <div class="sup-side-head">
          <div><h2>${admin ? 'ข้อความจากผู้ใช้' : 'ติดต่อแอดมิน'}</h2><div class="muted" id="supCount"></div></div>
          ${admin ? '' : '<button type="button" class="sm pill" id="supNewBtn">+ ส่งข้อความใหม่</button>'}
        </div>
        ${admin ? `<div class="adm-chips sup-filter" id="supFilter">
          <button type="button" data-f="active" class="active">ต้องจัดการ</button>
          <button type="button" data-f="answered">ตอบแล้ว</button>
          <button type="button" data-f="closed">ปิดแล้ว</button>
          <button type="button" data-f="all">ทั้งหมด</button></div>` : ''}
        <div class="sup-list" id="supList"></div>
      </div>
      <div class="card sup-main">
        <div class="sup-empty" id="supEmpty">
          <div class="sup-empty-ic">💬</div>
          <h3>${admin ? 'เลือกเรื่องจากรายการ' : 'มีปัญหาหรือข้อสงสัย? ทักแอดมินได้เลย'}</h3>
          <p class="muted">${admin ? 'เลือกเรื่องทางซ้ายเพื่ออ่านและตอบกลับ' : 'เช่น ชำระค่าแพลนแล้วยังไม่ต่ออายุ สลิปโดเนทไม่ผ่าน ปัญหา Overlay ใน OBS — แอดมินจะตอบกลับที่นี่ และแจ้งเตือนที่กระดิ่ง'}</p>
          ${admin ? '' : '<button type="button" class="pill" id="supNewBtn2">+ ส่งข้อความใหม่</button>'}
        </div>

        <form class="sup-new" id="supNew" hidden>
          <h2>ส่งข้อความถึงแอดมิน</h2>
          <label>หมวดหมู่</label>
          <select id="supCat"></select>
          <label>หัวข้อ</label>
          <input id="supSubject" maxlength="120" placeholder="เช่น โอนค่าแพลนแล้ว แพลนยังไม่ต่ออายุ">
          <label>รายละเอียด</label>
          <textarea id="supBody" rows="6" maxlength="2000" placeholder="อธิบายปัญหาให้ละเอียด เช่น วันเวลา จำนวนเงิน รหัสอ้างอิง"></textarea>
          <div class="row" style="margin-top:14px">
            <button type="submit" id="supSend">ส่งข้อความ</button>
            <button type="button" class="ghost" id="supCancel">ยกเลิก</button>
          </div>
        </form>

        <div class="sup-thread" id="supThread" hidden>
          <div class="sup-thread-head">
            <button type="button" class="sup-back" id="supBack" aria-label="กลับไปรายการ">←</button>
            <div class="sup-thread-title">
              <b id="supTitle"></b>
              <div class="muted" id="supMeta"></div>
            </div>
            <div class="sup-thread-actions" id="supActions"></div>
          </div>
          <div class="sup-msgs" id="supMsgs"></div>
          <form class="sup-reply" id="supReply">
            <textarea id="supReplyBody" rows="2" maxlength="2000" placeholder="พิมพ์ข้อความ… (Enter = ส่ง, Shift+Enter = ขึ้นบรรทัดใหม่)"></textarea>
            <button type="submit" id="supReplyBtn" aria-label="ส่ง">ส่ง</button>
          </form>
        </div>
      </div>
    </div>`;

  const $ = (id) => document.getElementById(id);
  const fmtTime = (ts) => new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const badge = (s) => { const [l, c] = LABEL[s] || [s, '']; return `<span class="pd-st ${c}">${l}</span>`; };

  const show = (view) => {
    $('supEmpty').hidden = view !== 'empty';
    $('supNew').hidden = view !== 'new';
    $('supThread').hidden = view !== 'thread';
    root.querySelector('.sup').classList.toggle('viewing', view !== 'empty');
  };

  async function loadList() {
    const url = admin ? '/api/support/admin' : '/api/support/tickets';
    S.list = await api(url).catch(() => []);
    renderList();
    updateBadges();
  }

  function renderList() {
    let list = S.list;
    if (admin && S.filter !== 'all') list = list.filter((t) => (S.filter === 'active' ? t.status === 'open' || t.unread : t.status === S.filter));
    $('supCount').textContent = admin
      ? `${S.list.filter((t) => t.status === 'open').length} เรื่องรอตอบ · ทั้งหมด ${S.list.length}`
      : (S.list.length ? `${S.list.length} เรื่อง` : '');
    const box = $('supList');
    box.innerHTML = list.map((t) => `
      <button type="button" class="sup-item${S.current === t.id ? ' active' : ''}${t.unread ? ' unread' : ''}" data-id="${t.id}">
        <div class="sup-item-top">
          <b>${esc(t.subject)}</b>
          <span class="sup-time">${fmtTime(t.updated_at)}</span>
        </div>
        ${admin ? `<div class="sup-who">@${esc(t.username)}</div>` : ''}
        <div class="sup-last">${esc(t.last_body || '')}</div>
        <div class="sup-item-bot"><span class="sup-cat">${esc(t.category)}</span>${badge(t.status)}${t.unread ? '<span class="sup-dot"></span>' : ''}</div>
      </button>`).join('') || `<div class="adm-empty">${admin ? 'ไม่มีเรื่องในหมวดนี้' : 'ยังไม่มีข้อความ'}</div>`;
    box.querySelectorAll('.sup-item').forEach((b) => { b.onclick = () => openTicket(Number(b.dataset.id)); });
  }

  async function openTicket(id, { silent = false } = {}) {
    let d;
    try { d = await api(`${base}/${id}`); } catch (e) { if (!silent) toast(e.message, false); return; }
    S.current = id;
    const t = d.ticket;
    $('supTitle').textContent = t.subject;
    $('supMeta').innerHTML = (admin
      ? `@${esc(t.username)} · ${esc(d.user.email || '-')} · `
      : '') + `${esc(t.category)} · เปิดเมื่อ ${fmtTime(t.created_at)} · ${badge(t.status)}`;
    renderActions(t);
    const box = $('supMsgs');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    box.innerHTML = d.messages.map((m) => {
      const mine = admin ? !!m.is_admin : !m.is_admin;
      const who = m.is_admin ? (admin ? `แอดมิน (@${esc(m.username)})` : 'แอดมิน') : (admin ? `@${esc(m.username)}` : 'คุณ');
      return `<div class="sup-msg ${mine ? 'me' : 'them'}${m.is_admin ? ' admin' : ''}">
          <div class="sup-bubble">${esc(m.body).replace(/\n/g, '<br>')}</div>
          <div class="sup-msg-meta">${who} · ${fmtTime(m.created_at)}</div>
        </div>`;
    }).join('') + (t.status === 'closed' ? '<div class="sup-closed">— เรื่องนี้ปิดแล้ว ' + (admin ? '' : '(พิมพ์ตอบกลับเพื่อเปิดเรื่องอีกครั้ง)') + ' —</div>' : '');
    if (!silent || atBottom) box.scrollTop = box.scrollHeight;
    show('thread');
    const hash = 'support/' + id;
    if (location.hash.slice(1) !== hash) history.replaceState(null, '', '#' + hash);
    // อ่านแล้ว → ล้างตัวนับในรายการ
    const it = S.list.find((x) => x.id === id);
    if (it) { it.unread = 0; it.status = t.status; }
    renderList();
    updateBadges();
  }

  function renderActions(t) {
    const box = $('supActions');
    box.innerHTML = '';
    const btn = (label, cls, fn) => { const b = el('button', { type: 'button', class: 'sm ' + cls }, label); b.onclick = fn; box.append(b); };
    if (admin) {
      if (t.status !== 'closed') btn('ปิดเรื่อง', 'ghost', () => setStatus(t.id, 'closed'));
      else btn('เปิดเรื่องอีกครั้ง', 'ghost', () => setStatus(t.id, 'open'));
    } else if (t.status !== 'closed') {
      btn('ปิดเรื่อง', 'ghost', async () => {
        if (!(await confirmDialog('ปิดเรื่องนี้?', 'ปัญหาได้รับการแก้ไขแล้ว — พิมพ์ตอบกลับภายหลังเพื่อเปิดเรื่องอีกครั้งได้', { confirmText: 'ปิดเรื่อง' }))) return;
        try { await api(`/api/support/tickets/${t.id}/close`, { method: 'POST' }); toast('ปิดเรื่องแล้ว'); loadList(); openTicket(t.id); }
        catch (e) { toast(e.message, false); }
      });
    }
  }

  async function setStatus(id, status) {
    try { await api(`/api/support/admin/${id}/status`, { method: 'POST', body: { status } }); toast(status === 'closed' ? 'ปิดเรื่องแล้ว' : 'เปิดเรื่องอีกครั้งแล้ว'); loadList(); openTicket(id); }
    catch (e) { toast(e.message, false); }
  }

  async function updateBadges() {
    const u = await api('/api/support/unread').catch(() => null);
    if (!u) return;
    const n = admin ? u.admin : u.mine;
    document.querySelectorAll('[data-support-badge]').forEach((b) => { b.hidden = !n; b.textContent = n; });
  }

  // ---------- เปิดเรื่องใหม่ ----------
  const openNew = () => {
    S.current = null;
    renderList();
    $('supSubject').value = '';
    $('supBody').value = '';
    show('new');
    $('supSubject').focus();
  };
  if (!admin) {
    $('supNewBtn').onclick = openNew;
    $('supNewBtn2').onclick = openNew;
    api('/api/support/categories').then((c) => {
      S.categories = c;
      $('supCat').innerHTML = c.map((x) => `<option>${esc(x)}</option>`).join('');
    }).catch(() => {});
  }
  $('supCancel').onclick = () => show('empty');
  $('supNew').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('supSend');
    btn.disabled = true;
    try {
      const r = await api('/api/support/tickets', { method: 'POST', body: { category: $('supCat').value, subject: $('supSubject').value, body: $('supBody').value } });
      toast('ส่งข้อความถึงแอดมินแล้ว');
      await loadList();
      openTicket(r.id);
    } catch (err) { toast(err.message, false); }
    btn.disabled = false;
  };

  // ---------- ตอบกลับ ----------
  $('supReply').onsubmit = async (e) => {
    e.preventDefault();
    const body = $('supReplyBody').value.trim();
    if (!body || !S.current) return;
    const btn = $('supReplyBtn');
    btn.disabled = true;
    try {
      await api(`${base}/${S.current}/messages`, { method: 'POST', body: { body } });
      $('supReplyBody').value = '';
      await openTicket(S.current);
      loadList();
    } catch (err) { toast(err.message, false); }
    btn.disabled = false;
  };
  $('supReplyBody').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('supReply').requestSubmit(); }
  });
  $('supBack').onclick = () => { S.current = null; renderList(); show('empty'); history.replaceState(null, '', '#support'); };

  if (admin) {
    document.querySelectorAll('#supFilter button').forEach((b) => {
      b.onclick = () => { S.filter = b.dataset.f; setChips('supFilter', b.dataset.f); renderList(); };
    });
  }

  // realtime: มีข้อความใหม่ในเรื่องไหน → โหลดรายการใหม่ + ถ้าเปิดเรื่องนั้นอยู่ก็โหลดแชทใหม่
  onAppSocket((socket) => socket.on('support:update', (p) => {
    loadList();
    if (S.current === p.id && !$('supThread').hidden) openTicket(p.id, { silent: true });
  }));

  // ลิงก์ตรง #support/<id> (จากแจ้งเตือน)
  const fromHash = () => {
    const m = /^#support\/(\d+)$/.exec(location.hash);
    if (m && Number(m[1]) !== S.current) openTicket(Number(m[1]));
  };
  window.addEventListener('hashchange', fromHash);

  show('empty');
  loadList().then(fromHash);
}

// ใช้ได้ทั้ง 2 หน้า (หน้าแอดมินมี setChips ของตัวเองอยู่แล้ว)
if (typeof setChips !== 'function') {
  window.setChips = (boxId, value) => document.querySelectorAll('#' + boxId + ' button').forEach((b) => b.classList.toggle('active', b.dataset.f === value));
}
