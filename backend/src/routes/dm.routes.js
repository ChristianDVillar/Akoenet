const express = require("express");
const pool = require("../config/db");
const auth = require("../middleware/auth");

const router = express.Router();
router.use(auth);

function pairUsers(a, b) {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return { low, high };
}

async function isConversationParticipant(conversationId, userId) {
  const result = await pool.query(
    `SELECT 1
     FROM direct_conversations
     WHERE id = $1
       AND (user_low_id = $2 OR user_high_id = $2)`,
    [conversationId, userId]
  );
  return result.rows.length > 0;
}

router.get("/users", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const params = [req.user.id];
  let where = "WHERE u.id <> $1";
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where += ` AND LOWER(u.username) LIKE $${params.length}`;
  }
  params.push(20);
  const result = await pool.query(
    `SELECT u.id, u.username, u.avatar_url
     FROM users u
     ${where}
     ORDER BY u.username ASC
     LIMIT $${params.length}`,
    params
  );
  res.json(result.rows);
});

router.post("/conversations", async (req, res) => {
  const targetUserId = parseInt(req.body?.target_user_id, 10);
  if (Number.isNaN(targetUserId)) {
    return res.status(400).json({ error: "target_user_id required" });
  }
  if (targetUserId === req.user.id) {
    return res.status(400).json({ error: "Cannot create direct chat with self" });
  }
  const targetExists = await pool.query("SELECT id FROM users WHERE id = $1", [targetUserId]);
  if (!targetExists.rows.length) {
    return res.status(404).json({ error: "User not found" });
  }
  const { low, high } = pairUsers(req.user.id, targetUserId);
  const result = await pool.query(
    `INSERT INTO direct_conversations (user_low_id, user_high_id)
     VALUES ($1, $2)
     ON CONFLICT (user_low_id, user_high_id) DO UPDATE SET user_low_id = EXCLUDED.user_low_id
     RETURNING *`,
    [low, high]
  );
  res.status(201).json(result.rows[0]);
});

router.get("/conversations", async (req, res) => {
  const result = await pool.query(
    `SELECT c.id,
            c.created_at,
            u.id AS peer_id,
            u.username AS peer_username,
            u.avatar_url AS peer_avatar_url,
            lm.content AS last_message,
            lm.created_at AS last_message_at
     FROM direct_conversations c
     JOIN users u
       ON u.id = CASE WHEN c.user_low_id = $1 THEN c.user_high_id ELSE c.user_low_id END
     LEFT JOIN LATERAL (
       SELECT dm.content, dm.created_at
       FROM direct_messages dm
       WHERE dm.conversation_id = c.id
       ORDER BY dm.created_at DESC
       LIMIT 1
     ) lm ON true
     WHERE c.user_low_id = $1 OR c.user_high_id = $1
     ORDER BY lm.created_at DESC NULLS LAST, c.created_at DESC`,
    [req.user.id]
  );
  res.json(result.rows);
});

router.get("/conversations/:conversationId/messages", async (req, res) => {
  const conversationId = parseInt(req.params.conversationId, 10);
  if (Number.isNaN(conversationId)) {
    return res.status(400).json({ error: "Invalid conversation" });
  }
  const allowed = await isConversationParticipant(conversationId, req.user.id);
  if (!allowed) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const result = await pool.query(
    `SELECT dm.id, dm.conversation_id, dm.sender_id, dm.content, dm.image_url, dm.created_at, u.username
     FROM direct_messages dm
     JOIN users u ON u.id = dm.sender_id
     WHERE dm.conversation_id = $1
     ORDER BY dm.created_at ASC`,
    [conversationId]
  );
  res.json(result.rows);
});

router.post("/conversations/:conversationId/messages", async (req, res) => {
  const conversationId = parseInt(req.params.conversationId, 10);
  const content = String(req.body?.content || "").trim();
  const imageUrl = req.body?.image_url ? String(req.body.image_url).trim() : null;
  if (Number.isNaN(conversationId) || (!content && !imageUrl)) {
    return res.status(400).json({ error: "conversationId and content or image required" });
  }
  const allowed = await isConversationParticipant(conversationId, req.user.id);
  if (!allowed) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const result = await pool.query(
    `INSERT INTO direct_messages (conversation_id, sender_id, content, image_url)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [conversationId, req.user.id, content || "(imagen)", imageUrl]
  );
  const row = result.rows[0];
  const user = await pool.query("SELECT username FROM users WHERE id = $1", [req.user.id]);
  res.status(201).json({ ...row, username: user.rows[0]?.username || "user" });
});

module.exports = router;
