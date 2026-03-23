const express = require("express");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const { canAccessChannel } = require("../lib/membership");

const router = express.Router();
router.use(auth);

const DEFAULT_LIMIT = 100;

/** Message history for EchoNet */
router.get("/channel/:channelId", async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  if (Number.isNaN(channelId)) {
    return res.status(400).json({ error: "Invalid channel" });
  }
  if (!(await canAccessChannel(req.user.id, channelId))) {
    return res.status(403).json({ error: "No access to channel" });
  }
  const limit = Math.min(
    parseInt(req.query.limit, 10) || DEFAULT_LIMIT,
    200
  );
  const beforeId = req.query.before
    ? parseInt(req.query.before, 10)
    : null;

  let query = `
    SELECT m.*, u.username
    FROM messages m
    JOIN users u ON u.id = m.user_id
    WHERE m.channel_id = $1
  `;
  const params = [channelId];
  if (beforeId && !Number.isNaN(beforeId)) {
    params.push(beforeId);
    query += ` AND m.id < $${params.length}`;
  }
  query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await pool.query(query, params);
  res.json(result.rows.reverse());
});

module.exports = router;
