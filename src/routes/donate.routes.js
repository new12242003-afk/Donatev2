const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth');

// โดเนทจ่ายผ่าน QR พร้อมเพย์ของสตรีมเมอร์ (src/routes/qrdonate.routes.js) — ไฟล์นี้เหลือแค่ประวัติของผู้โดเนทที่ล็อกอิน
const router = express.Router();
router.use(requireAuth);

router.get('/sent', (req, res) => {
  res.json(db.prepare(`SELECT d.*, u.username AS streamer_username
    FROM donations d JOIN users u ON u.id = d.streamer_user_id
    WHERE d.donor_user_id = ? ORDER BY d.id DESC LIMIT 50`).all(req.user.id));
});

module.exports = router;
