const express = require("express");
const { z } = require("zod");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const requireTermsAccepted = require("../middleware/require-terms");
const validate = require("../middleware/validate");
const { reportRateLimiter, userDataRateLimiter, dmUserSearchRateLimiter } = require("../middleware/rate-limit");
const { logAdminAction } = require("../lib/audit-log");
const { sanitizeMediaUrl, sanitizeUserMediaFields, sanitizeImageUrlField } = require("../lib/sanitize-media-url");
const { getConnectedUserIdsGlobal } = require("../sockets/chat.socket");
const { textContainsBlockedLanguage, BLOCKED_MESSAGE } = require("../lib/blocked-content");
const { areUsersBlocked } = require("../lib/social-guard");

const router = express.Router();
router.use(auth);
router.use(requireTermsAccepted);

const usersQuerySchema = z.object({
  q: z.string().trim().max(60).optional().default(""),
});
const createConversationSchema = z.object({
  target_user_id: z.coerce.number().int().positive(),
});
const conversationParamsSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
});
const createMessageSchema = z.object({
  content: z.string().trim().max(4000).optional().default(""),
  image_url: z.string().trim().max(2000).optional().nullable(),
  reply_to_message_id: z.coerce.number().int().positive().optional().nullable(),
});
const dmSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().positive().max(50).optional(),
});
const dmHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  after: z.coerce.number().int().positive().optional(),
});
const editDmBodySchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

/** DM rows with optional reply preview (parent snippet). */
const DM_LIST_SELECT = `
  SELECT dm.*, u.username, u.avatar_url,
    rp.content AS reply_preview_content,
    ru.username AS reply_preview_username
  FROM direct_messages dm
  JOIN users u ON u.id = dm.sender_id
  LEFT JOIN direct_messages rp ON rp.id = dm.reply_to_id
  LEFT JOIN users ru ON ru.id = rp.sender_id
`;
const dmMessageIdParamSchema = z.object({
  dmMessageId: z.coerce.number().int().positive(),
});
const reportBodySchema = z.object({
  reason: z.string().trim().min(3).max(120),
  details: z.string().trim().max(1000).optional(),
});

function pairUsers(a, b) {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return { low, high };
}

function effectivePresence(status, isConnected) {
  const normalized = String(status || "").toLowerCase();
  if (!isConnected) return "offline";
  if (normalized === "invisible") return "offline";
  return normalized || "online";
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

/**
 * Solo usuarios con los que hay relación: mismo servidor o conversación DM ya existente.
 * Evita enumerar toda la tabla `users` (privacidad).
 */
router.get(
  "/users",
  dmUserSearchRateLimiter,
  validate({ query: usersQuerySchema }),
  async (req, res) => {
  const q = req.query.q;
  const me = req.user.id;
  const params = [me];
  let where = `WHERE u.id <> $1
    AND (
      EXISTS (
        SELECT 1 FROM server_members sm_me
        INNER JOIN server_members sm_them
          ON sm_me.server_id = sm_them.server_id AND sm_them.user_id = u.id
        WHERE sm_me.user_id = $1
      )
      OR EXISTS (
        SELECT 1 FROM direct_conversations dc
        WHERE dc.user_low_id = LEAST($1::int, u.id)
          AND dc.user_high_id = GREATEST($1::int, u.id)
      )
    )`;
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where += ` AND LOWER(u.username) LIKE $${params.length}`;
  }
  params.push(20);
  const result = await pool.query(
    `SELECT u.id, u.username, u.avatar_url, u.presence_status
     FROM users u
     ${where}
     ORDER BY u.username ASC
     LIMIT $${params.length}`,
    params
  );
  const connectedSet = new Set(getConnectedUserIdsGlobal().map((id) => Number(id)));
  const payload = result.rows.map((row) => ({
    ...row,
    presence_status: effectivePresence(row?.presence_status, connectedSet.has(Number(row?.id))),
  }));
  res.json(payload.map((row) => sanitizeUserMediaFields(row)));
  }
);

router.post("/conversations", validate({ body: createConversationSchema }), async (req, res) => {
  const targetUserId = req.body.target_user_id;
  if (targetUserId === req.user.id) {
    return res.status(400).json({ error: "Cannot create direct chat with self" });
  }
  const targetExists = await pool.query("SELECT id FROM users WHERE id = $1", [targetUserId]);
  if (!targetExists.rows.length) {
    return res.status(404).json({ error: "User not found" });
  }
  if (await areUsersBlocked(req.user.id, targetUserId)) {
    return res.status(403).json({ error: "blocked" });
  }
  const { low, high } = pairUsers(req.user.id, targetUserId);
  const already = await pool.query(
    "SELECT id FROM direct_conversations WHERE user_low_id = $1 AND user_high_id = $2",
    [low, high]
  );
  if (already.rows.length === 0) {
    const mutualServer = await pool.query(
      `SELECT 1 AS ok
       FROM server_members sm1
       INNER JOIN server_members sm2 ON sm1.server_id = sm2.server_id AND sm2.user_id = $2
       WHERE sm1.user_id = $1
       LIMIT 1`,
      [req.user.id, targetUserId]
    );
    if (mutualServer.rows.length === 0) {
      return res.status(403).json({
        error: "You can only start a direct message with someone you share a server with.",
      });
    }
  }
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
            u.presence_status AS peer_presence_status,
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
  const connectedSet = new Set(getConnectedUserIdsGlobal().map((id) => Number(id)));
  res.json(
    result.rows.map((row) => ({
      ...row,
      peer_avatar_url:
        row.peer_avatar_url != null ? sanitizeMediaUrl(row.peer_avatar_url) : row.peer_avatar_url,
      peer_presence_status: effectivePresence(
        row?.peer_presence_status,
        connectedSet.has(Number(row?.peer_id))
      ),
    }))
  );
});

router.get(
  "/conversations/:conversationId/messages/search",
  validate({ params: conversationParamsSchema, query: dmSearchQuerySchema }),
  async (req, res) => {
    const conversationId = req.params.conversationId;
    const allowed = await isConversationParticipant(conversationId, req.user.id);
    if (!allowed) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const q = req.query.q.trim();
    const limit = req.query.limit || 30;
    try {
      const result = await pool.query(
        `${DM_LIST_SELECT}
         WHERE dm.conversation_id = $1
           AND to_tsvector('simple', coalesce(dm.content, '')) @@ plainto_tsquery('simple', $2)
         ORDER BY dm.created_at DESC
         LIMIT $3`,
        [conversationId, q, limit]
      );
      const rows = result.rows.reverse();
      res.json(rows.map((row) => sanitizeUserMediaFields(sanitizeImageUrlField(row))));
    } catch {
      return res.status(400).json({ error: "Invalid search query" });
    }
  }
);

router.get(
  "/conversations/:conversationId/messages",
  validate({ params: conversationParamsSchema, query: dmHistoryQuerySchema }),
  async (req, res) => {
  const conversationId = req.params.conversationId;
  const limit = req.query.limit || 50;
  const afterId = req.query.after || null;
  const allowed = await isConversationParticipant(conversationId, req.user.id);
  if (!allowed) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const result = afterId
    ? await pool.query(
        `${DM_LIST_SELECT}
         WHERE dm.conversation_id = $1
           AND dm.id > $2
         ORDER BY dm.created_at ASC
         LIMIT $3`,
        [conversationId, afterId, limit]
      )
    : await pool.query(
        `${DM_LIST_SELECT}
         WHERE dm.conversation_id = $1
         ORDER BY dm.created_at ASC`,
        [conversationId]
      );
  res.json(result.rows.map((row) => sanitizeUserMediaFields(sanitizeImageUrlField(row))));
});

router.post(
  "/conversations/:conversationId/messages",
  validate({ params: conversationParamsSchema, body: createMessageSchema }),
  async (req, res) => {
  const conversationId = req.params.conversationId;
  const content = req.body.content;
  const imageUrl = req.body.image_url || null;
  const replyToRaw = req.body.reply_to_message_id;
  if (!content && !imageUrl) {
    return res.status(400).json({ error: "conversationId and content or image required" });
  }
  const allowed = await isConversationParticipant(conversationId, req.user.id);
  if (!allowed) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const peerRes = await pool.query(
    `SELECT CASE WHEN c.user_low_id = $1 THEN c.user_high_id ELSE c.user_low_id END AS peer
     FROM direct_conversations c WHERE c.id = $2`,
    [req.user.id, conversationId]
  );
  const peerId = peerRes.rows[0]?.peer;
  if (peerId != null && (await areUsersBlocked(req.user.id, peerId))) {
    return res.status(403).json({ error: "blocked" });
  }
  const text = String(content || "").trim();
  if (text && textContainsBlockedLanguage(text, { source: "rest_dm_post", userId: req.user.id })) {
    return res.status(400).json({ error: "blocked_content", message: BLOCKED_MESSAGE });
  }
  let replyToId = null;
  if (replyToRaw != null && replyToRaw !== "") {
    const rid = Number(replyToRaw);
    if (Number.isFinite(rid) && rid > 0) {
      const chk = await pool.query(
        `SELECT id FROM direct_messages WHERE id = $1 AND conversation_id = $2`,
        [rid, conversationId]
      );
      if (chk.rows.length) replyToId = rid;
    }
  }
  const result = await pool.query(
    `INSERT INTO direct_messages (conversation_id, sender_id, content, image_url, reply_to_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [conversationId, req.user.id, content || "(imagen)", imageUrl, replyToId]
  );
  const row = result.rows[0];
  const user = await pool.query("SELECT username, avatar_url FROM users WHERE id = $1", [req.user.id]);
  let replyPreviewContent = null;
  let replyPreviewUsername = null;
  if (row.reply_to_id) {
    const rp = await pool.query(
      `SELECT dm.content, u.username
       FROM direct_messages dm
       JOIN users u ON u.id = dm.sender_id
       WHERE dm.id = $1`,
      [row.reply_to_id]
    );
    if (rp.rows.length) {
      replyPreviewContent = rp.rows[0].content;
      replyPreviewUsername = rp.rows[0].username;
    }
  }
  res.status(201).json(
    sanitizeUserMediaFields(
      sanitizeImageUrlField({
        ...row,
        username: user.rows[0]?.username || "user",
        avatar_url: user.rows[0]?.avatar_url ? sanitizeMediaUrl(user.rows[0].avatar_url) : null,
        reply_preview_content: replyPreviewContent,
        reply_preview_username: replyPreviewUsername,
      })
    )
  );
});

router.patch(
  "/messages/:dmMessageId",
  userDataRateLimiter,
  validate({ params: dmMessageIdParamSchema, body: editDmBodySchema }),
  async (req, res) => {
    const dmMessageId = req.params.dmMessageId;
    const content = req.body.content.trim();
    if (textContainsBlockedLanguage(content, { source: "rest_patch_dm", userId: req.user.id })) {
      return res.status(400).json({ error: "blocked_content", message: BLOCKED_MESSAGE });
    }
    const row = await pool.query(
      `SELECT id, sender_id, conversation_id
       FROM direct_messages
       WHERE id = $1`,
      [dmMessageId]
    );
    if (!row.rows.length) {
      return res.status(404).json({ error: "Message not found" });
    }
    const msg = row.rows[0];
    if (Number(msg.sender_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: "You can only edit your own messages" });
    }
    const allowed = await isConversationParticipant(msg.conversation_id, req.user.id);
    if (!allowed) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const oldContent = String(row.rows[0].content || "");
    const updated = await pool.query(
      `UPDATE direct_messages
       SET content = $2, edited_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [dmMessageId, content]
    );
    if (oldContent !== content) {
      await pool.query(
        `INSERT INTO message_edit_history (direct_message_id, old_content, new_content, edited_by)
         VALUES ($1, $2, $3, $4)`,
        [dmMessageId, oldContent, content, req.user.id]
      );
    }
    const u = await pool.query("SELECT username, avatar_url FROM users WHERE id = $1", [req.user.id]);
    const payload = sanitizeUserMediaFields(
      sanitizeImageUrlField({
        ...updated.rows[0],
        username: u.rows[0]?.username,
        avatar_url: u.rows[0]?.avatar_url ? sanitizeMediaUrl(u.rows[0].avatar_url) : null,
      })
    );
    const io = req.app?.locals?.io;
    if (io) {
      io.to(`dm:${msg.conversation_id}`).emit("direct_message_updated", payload);
    }
    res.json(payload);
  }
);

router.get("/messages/:dmMessageId/edit-history", validate({ params: dmMessageIdParamSchema }), async (req, res) => {
  const dmMessageId = req.params.dmMessageId;
  const row = await pool.query(
    `SELECT id, sender_id, conversation_id
     FROM direct_messages
     WHERE id = $1`,
    [dmMessageId]
  );
  if (!row.rows.length) {
    return res.status(404).json({ error: "Message not found" });
  }
  const msg = row.rows[0];
  const allowed = await isConversationParticipant(msg.conversation_id, req.user.id);
  if (!allowed) return res.status(403).json({ error: "Forbidden" });
  if (Number(msg.sender_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const result = await pool.query(
    `SELECT meh.id, meh.old_content, meh.new_content, meh.edited_by, meh.edited_at, u.username AS edited_by_username
     FROM message_edit_history meh
     JOIN users u ON u.id = meh.edited_by
     WHERE meh.direct_message_id = $1
     ORDER BY meh.edited_at DESC`,
    [dmMessageId]
  );
  return res.json(result.rows);
});

router.post(
  "/messages/:dmMessageId/report",
  reportRateLimiter,
  validate({ params: dmMessageIdParamSchema, body: reportBodySchema }),
  async (req, res) => {
    const dmMessageId = req.params.dmMessageId;
    const row = await pool.query(
      `SELECT id, conversation_id, sender_id
       FROM direct_messages
       WHERE id = $1`,
      [dmMessageId]
    );
    if (!row.rows.length) {
      return res.status(404).json({ error: "Message not found" });
    }
    const msg = row.rows[0];
    const allowed = await isConversationParticipant(msg.conversation_id, req.user.id);
    if (!allowed) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await logAdminAction({
      actorUserId: req.user.id,
      action: "dm_message_report_user",
      targetMessageId: Number(dmMessageId),
      channelId: null,
      serverId: null,
      metadata: {
        reason: req.body.reason,
        details: req.body.details || null,
        reported_user_id: Number(msg.sender_id),
        conversation_id: Number(msg.conversation_id),
      },
    });
    res.status(201).json({ reported: true, dm_message_id: Number(dmMessageId) });
  }
);

module.exports = router;
