const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth');
const { timeRange } = require('../util');

// โดเนทจ่ายผ่าน QR พร้อมเพย์ของสตรีมเมอร์ (src/routes/qrdonate.routes.js) — ไฟล์นี้เหลือแค่ประวัติของผู้โดเนทที่ล็อกอิน
const router = express.Router();
router.use(requireAuth);

// ?from=&to= = ช่วงเวลาที่เลือกในแดชบอร์ด (ไม่ส่ง = ทั้งหมด) — เพดาน SENT_LIMIT รายการล่าสุด
const SENT_LIMIT = 2000;
router.get('/sent', (req, res) => {
  const { from, to } = timeRange(req.query);
  res.json(db.prepare(`SELECT d.*, u.username AS streamer_username
    FROM donations d JOIN users u ON u.id = d.streamer_user_id
    WHERE d.donor_user_id = ? AND d.created_at >= ? AND d.created_at < ? ORDER BY d.id DESC LIMIT ?`).all(req.user.id, from, to, SENT_LIMIT));
});

module.exports = router;
