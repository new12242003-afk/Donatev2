let ME;

(async function () {
  ME = await getMe();
  if (!ME) { location.href = '/login.html'; return; }
  mountNav(ME);

  document.getElementById('bal').textContent = fmt(ME.token_balance);
  if (!ME.email_verified) document.getElementById('verifyWarn').style.display = '';

  const cfg = await api('/api/public/config');
  const pkgBox = document.getElementById('pkgs');
  cfg.topup_packages.forEach((v) => {
    const b = el('button', { class: 'ghost sm' }, v + ' ฿');
    b.onclick = () => doTopup(v, 'mock');
    pkgBox.append(b);
  });

  document.getElementById('topupGo').onclick = () =>
    doTopup(Number(document.getElementById('topupAmt').value), document.getElementById('topupMethod').value);
})();

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
}
