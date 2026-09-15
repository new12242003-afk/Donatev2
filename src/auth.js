const { db } = require('./db');

function currentUser(req) {
  if (!req.session || !req.session.userId) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId) || null;
}

function requireAuth(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
  if (u.banned) return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน' });
  req.user = u;
  next();
}

function requireVerified(req, res, next) {
  if (!req.user.email_verified) {
    return res.status(403).json({ error: 'กรุณายืนยันอีเมลก่อนใช้งานฟีเจอร์นี้', code: 'unverified' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงส่วนนี้' });
    }
    next();
  };
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    display_name: u.display_name,
    token_balance: u.token_balance,
    earnings_balance: u.earnings_balance,
    overlay_key: u.overlay_key,
    email_verified: !!u.email_verified,
    banned: !!u.banned,
    avatar_url: u.avatar_url || null,
    first_name: u.first_name || '',
    last_name: u.last_name || '',
    national_id: u.national_id || '',
    birth_date: u.birth_date || '',
    address_line: u.address_line || '',
    address_subdistrict: u.address_subdistrict || '',
    address_district: u.address_district || '',
    address_province: u.address_province || '',
    address_zipcode: u.address_zipcode || '',
  };
}

module.exports = { currentUser, requireAuth, requireVerified, requireRole, publicUser };
