(async function () {
  const me = await getMe();
  if (!me) { location.href = '/login.html'; return; }
  if (me.role !== 'admin') {
    document.body.innerHTML = '<div class="container"><div class="card">หน้านี้สำหรับแอดมินเท่านั้น</div></div>';
    return;
  }
  mountNav(me);
  loadStats(); loadUsers(); loadStickers(); loadConfig(); loadLists();

  document.getElementById('search').onclick = () => loadUsers(document.getElementById('q').value);
  document.getElementById('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadUsers(e.target.value); });
  document.getElementById('addSticker').onclick = addSticker;
  document.getElementById('saveCfg').onclick = saveConfig;
})();

async function loadStats() {
  const s = await api('/api/admin/stats');
  const rm = Object.fromEntries(s.users.map((r) => [r.role, r.c]));
  const totalUsers = s.users.reduce((a, r) => a + r.c, 0);
  document.getElementById('stats').innerHTML = `
    <div class="card"><div class="muted">ผู้ใช้ทั้งหมด</div><div class="balance">${fmt(totalUsers)}</div>
      <div class="muted">แอดมิน ${rm.admin || 0} · สตรีมเมอร์ ${rm.streamer || 0} · ผู้โดเนท ${rm.donor || 0}</div></div>
    <div class="card"><div class="muted">โดเนททั้งหมด</div><div class="balance">${fmt(s.donations.c)}</div>
      <div class="muted">มูลค่ารวม ${fmt(s.donations.v)} ฿</div></div>
    <div class="card"><div class="muted">เติมเงินรวม</div><div class="balance">${fmt(s.topup_total)} ฿</div>
      <div class="muted">คำขอถอนค้าง ${s.pending_payouts} รายการ</div></div>`;
}

async function loadUsers(q = '') {
  const rows = await api('/api/admin/users?q=' + encodeURIComponent(q));
  document.getElementById('users').innerHTML = rows.map((u) => `
    <tr data-id="${u.id}">
      <td>${u.id}</td><td>${esc(u.username)}</td><td>${esc(u.email || '-')}</td>
      <td><select class="urole">${['donor', 'streamer', 'admin']
        .map((r) => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
      <td>${fmt(u.token_balance)} <button class="sm ghost adj" data-f="token_balance">±</button></td>
      <td>${fmt(u.earnings_balance)} <button class="sm ghost adj" data-f="earnings_balance">±</button></td>
      <td>${u.email_verified ? '✅' : '—'}</td>
      <td>${u.banned ? '<span class="pill err">ระงับ</span>' : '<span class="pill ok">ปกติ</span>'}</td>
      <td>
        <button class="sm save">บันทึก</button>
        <button class="sm ghost ban">${u.banned ? 'ปลดระงับ' : 'ระงับ'}</button>
        <button class="sm ghost pw">รีเซ็ตรหัส</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="9" class="muted">ไม่พบผู้ใช้</td></tr>';

  document.querySelectorAll('#users tr[data-id]').forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelector('.save').onclick = async () => {
      try {
        await api('/api/admin/users/' + id, { method: 'PATCH', body: { role: tr.querySelector('.urole').value } });
        toast('บันทึกแล้ว'); loadUsers(q); loadStats();
      } catch (e) { toast(e.message, false); }
    };
    tr.querySelector('.ban').onclick = async () => {
      const banned = tr.querySelector('.pill').classList.contains('err');
      await api('/api/admin/users/' + id, { method: 'PATCH', body: { banned: !banned } });
      loadUsers(q);
    };
    tr.querySelector('.pw').onclick = async () => {
      const p = prompt('ตั้งรหัสผ่านใหม่ (อย่างน้อย 6 ตัว)');
      if (!p) return;
      try { await api('/api/admin/users/' + id + '/reset-password', { method: 'POST', body: { password: p } }); toast('รีเซ็ตรหัสผ่านแล้ว'); }
      catch (e) { toast(e.message, false); }
    };
    tr.querySelectorAll('.adj').forEach((b) => {
      b.onclick = async () => {
        const d = prompt('ปรับยอด ' + b.dataset.f + ' (ใส่ +/- จำนวน เช่น 100 หรือ -50)');
        if (d === null) return;
        try {
          await api('/api/admin/users/' + id + '/adjust', { method: 'POST', body: { field: b.dataset.f, delta: Number(d) } });
          toast('ปรับยอดแล้ว'); loadUsers(q);
        } catch (e) { toast(e.message, false); }
      };
    });
  });
}

async function loadStickers() {
  const rows = await api('/api/admin/stickers');
  document.getElementById('stickers').innerHTML = rows.map((s) => `
    <tr data-id="${s.id}">
      <td>${esc(s.code)}</td>
      <td><input class="s_name" value="${esc(s.name)}" style="max-width:120px"></td>
      <td><input class="s_emoji" value="${esc(s.emoji || '')}" style="max-width:70px"></td>
      <td><input class="s_cost" type="number" value="${s.cost}" style="max-width:80px"></td>
      <td><input class="s_anim" value="${esc(s.animation)}" style="max-width:90px"></td>
      <td><input type="checkbox" class="s_en" ${s.enabled ? 'checked' : ''} style="width:auto"></td>
      <td><button class="sm save">บันทึก</button> <button class="sm danger del">ลบ</button></td>
    </tr>`).join('');

  document.querySelectorAll('#stickers tr[data-id]').forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelector('.save').onclick = async () => {
      try {
        await api('/api/admin/stickers/' + id, {
          method: 'PUT',
          body: {
            name: tr.querySelector('.s_name').value,
            emoji: tr.querySelector('.s_emoji').value,
            cost: Number(tr.querySelector('.s_cost').value),
            animation: tr.querySelector('.s_anim').value,
            enabled: tr.querySelector('.s_en').checked,
          },
        });
        toast('บันทึกแล้ว');
      } catch (e) { toast(e.message, false); }
    };
    tr.querySelector('.del').onclick = async () => {
      if (!confirm('ลบสติกเกอร์นี้?')) return;
      await api('/api/admin/stickers/' + id, { method: 'DELETE' });
      loadStickers();
    };
  });
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

async function loadConfig() {
  const c = await api('/api/admin/config');
  document.getElementById('c_site').value = c.site_name || '';
  document.getElementById('c_fee').value = c.platform_fee_percent || '0';
  document.getElementById('c_min').value = c.default_min_donation || '1';
  document.getElementById('c_max').value = c.default_max_donation || '1000';
  document.getElementById('c_pkg').value = c.topup_packages || '[20,50,100,300,500,1000]';
}

async function saveConfig() {
  try {
    await api('/api/admin/config', {
      method: 'PUT',
      body: {
        site_name: document.getElementById('c_site').value,
        platform_fee_percent: document.getElementById('c_fee').value,
        default_min_donation: document.getElementById('c_min').value,
        default_max_donation: document.getElementById('c_max').value,
        topup_packages: document.getElementById('c_pkg').value,
      },
    });
    toast('บันทึกการตั้งค่าแล้ว');
  } catch (e) { toast(e.message, false); }
}

async function loadLists() {
  const [don, tp, po] = await Promise.all([
    api('/api/admin/donations'), api('/api/admin/topups'), api('/api/admin/payouts'),
  ]);

  document.getElementById('don').innerHTML = don.map((d) =>
    `<tr><td>${new Date(d.created_at).toLocaleString('th-TH')}</td>`
    + `<td>${esc(d.donor_username || d.display_name)}</td><td>@${esc(d.streamer_username)}</td>`
    + `<td>${fmt(d.amount)} ฿</td><td>${esc(d.sticker_code || '-')}</td><td>${esc(d.message || '')}</td></tr>`
  ).join('') || '<tr><td colspan="6" class="muted">ยังไม่มีรายการ</td></tr>';

  document.getElementById('tp').innerHTML = tp.map((t) =>
    `<tr><td>${new Date(t.created_at).toLocaleString('th-TH')}</td><td>${esc(t.username)}</td>`
    + `<td>${fmt(t.amount_baht)}</td><td>${esc(t.method)}</td><td>${esc(t.status)}</td></tr>`
  ).join('') || '<tr><td colspan="5" class="muted">ยังไม่มีรายการ</td></tr>';

  document.getElementById('po').innerHTML = po.map((p) =>
    `<tr><td>${new Date(p.created_at).toLocaleString('th-TH')}</td><td>${esc(p.username)}</td>`
    + `<td>${fmt(p.amount)}</td><td>${esc(p.account_detail || '')}</td><td>${esc(p.status)}</td>`
    + `<td>${p.status === 'pending'
      ? `<button class="sm approve" data-id="${p.id}">จ่ายแล้ว</button> <button class="sm danger reject" data-id="${p.id}">ปฏิเสธ</button>`
      : ''}</td></tr>`
  ).join('') || '<tr><td colspan="6" class="muted">ยังไม่มีรายการ</td></tr>';

  document.querySelectorAll('#po .approve').forEach((b) => {
    b.onclick = async () => {
      await api('/api/admin/payouts/' + b.dataset.id + '/process', { method: 'POST', body: { status: 'paid' } });
      toast('อัปเดตแล้ว'); loadLists();
    };
  });
  document.querySelectorAll('#po .reject').forEach((b) => {
    b.onclick = async () => {
      await api('/api/admin/payouts/' + b.dataset.id + '/process', { method: 'POST', body: { status: 'rejected' } });
      toast('ปฏิเสธและคืนยอดแล้ว'); loadLists();
    };
  });
}
