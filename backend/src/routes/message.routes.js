const express = require("express");
const { z } = require("zod");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { reactionRateLimiter, reportRateLimiter, userDataRateLimiter } = require("../middleware/rate-limit");
const { canReadChannel, canManageChannels, getChannelServerId, listReadableChannelIds } = require("../lib/membership");
const { logAdminAction } = require("../lib/audit-log");
const { withReactionsOnMessages, getMessageReactions } = require("../lib/message-reactions");
const {
  sanitizeImageUrlField,
  sanitizeUserMediaFields,
  sanitizeMediaUrl,
} = require("../lib/sanitize-media-url");
const { textContainsBlockedLanguage } = require("../lib/blocked-content");

const router = express.Router();
router.use(auth);

/** List rows with optional reply preview (parent message snippet). */
const MESSAGE_LIST_SELECT = `
  SELECT m.*, u.username, u.avatar_url,
    rp.content AS reply_preview_content,
    ru.username AS reply_preview_username
  FROM messages m
  JOIN users u ON u.id = m.user_id
  LEFT JOIN messages rp ON rp.id = m.reply_to_id
  LEFT JOIN users ru ON ru.id = rp.sender_id
`;

const DEFAULT_LIMIT = 50;
const channelIdParamSchema = z.object({
  channelId: z.coerce.number().int().positive(),
});
const historyQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  before: z.coerce.number().int().positive().optional(),
});
const messageIdParamSchema = z.object({
  messageId: z.coerce.number().int().positive(),
});
const exportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).optional(),
});
const reactionBodySchema = z.object({
  reaction_key: z.string().trim().min(1).max(32),
});
const reportBodySchema = z.object({
  reason: z.string().trim().min(3).max(120),
  details: z.string().trim().max(1000).optional(),
});
const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().positive().max(50).optional(),
});
const messageContextQuerySchema = z.object({
  before: z.coerce.number().int().min(0).max(50).optional(),
  after: z.coerce.number().int().min(0).max(50).optional(),
});
const editMessageBodySchema = z.object({
  content: z.string().trim().min(1).max(4000),
});
const globalSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().positive().max(40).optional(),
});

const GLOBAL_MESSAGE_SELECT = `
  SELECT m.*, u.username, u.avatar_url,
    rp.content AS reply_preview_content,
    ru.username AS reply_preview_username,
    c.name AS channel_name,
    s.id AS server_id,
    s.name AS server_name
  FROM messages m
  JOIN users u ON u.id = m.user_id
  LEFT JOIN messages rp ON rp.id = m.reply_to_id
  LEFT JOIN users ru ON ru.id = rp.sender_id
  INNER JOIN channels c ON c.id = m.channel_id
  INNER JOIN servers s ON s.id = c.server_id
`;

/** Search across all channels the user can read (PostgreSQL FTS). */
router.get(
  "/search/global",
  validate({ query: globalSearchQuerySchema }),
  async (req, res) => {
    const q = req.query.q.trim();
    const limit = req.query.limit || 25;
    const channelIds = await listReadableChannelIds(req.user.id);
    if (!channelIds.length) {
      return res.json([]);
    }
    try {
      const result = await pool.query(
        `${GLOBAL_MESSAGE_SELECT}
         WHERE m.channel_id = ANY($1::int[])
           AND to_tsvector('simple', coalesce(m.content, '')) @@ plainto_tsquery('simple', $2)
         ORDER BY m.created_at DESC
         LIMIT $3`,
        [channelIds, q, limit]
      );
      const rows = result.rows.reverse();
      const enriched = await withReactionsOnMessages(rows, req.user.id);
      res.json(enriched.map((m) => sanitizeUserMediaFields(sanitizeImageUrlField(m))));
    } catch (e) {
      return res.status(400).json({ error: "Invalid search query" });
    }
  }
);

/** Message history for AkoeNet */
router.get("/channel/:channelId", validate({ params: channelIdParamSchema, query: historyQuerySchema }), async (req, res) => {
  const channelId = req.params.channelId;
  if (!(await canReadChannel(req.user.id, channelId))) {
    return res.status(403).json({ error: "No access to channel" });
  }
  const limit = req.query.limit || DEFAULT_LIMIT;
  const beforeId = req.query.before || null;

  let query = `${MESSAGE_LIST_SELECT}
    WHERE m.channel_id = $1
  `;
  const params = [channelId];
  if (beforeId) {
    params.push(beforeId);
    query += ` AND m.id < $${params.length}`;
  }
  query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await pool.query(query, params);
  const rows = result.rows.reverse();
  const enriched = await withReactionsOnMessages(rows, req.user.id);
  res.json(enriched.map((m) => sanitizeUserMediaFields(sanitizeImageUrlField(m))));
});

router.get(
  "/channel/:channelId/search",
  validate({ params: channelIdParamSchema, query: searchQuerySchema }),
  async (req, res) => {
    const channelId = req.params.channelId;
    if (!(await canReadChannel(req.user.id, channelId))) {
      return res.status(403).json({ error: "No access to channel" });
    }
    const q = req.query.q.trim();
    const limit = req.query.limit || 30;
    try {
      const result = await pool.query(
        `${MESSAGE_LIST_SELECT}
         WHERE m.channel_id = $1
           AND to_tsvector('simple', coalesce(m.content, '')) @@ plainto_tsquery('simple', $2)
         ORDER BY m.created_at DESC
         LIMIT $3`,
        [channelId, q, limit]
      );
      const rows = result.rows.reverse();
      const enriched = await withReactionsOnMessages(rows, req.user.id);
      res.json(enriched.map((m) => sanitizeUserMediaFields(sanitizeImageUrlField(m))));
    } catch (e) {
      return res.status(400).json({ error: "Invalid search query" });
    }
  }
);

router.get(
  "/channel/:channelId/export",
  validate({ params: channelIdParamSchema, query: exportQuerySchema }),
  async (req, res) => {
    const channelId = req.params.channelId;
    if (!(await canReadChannel(req.user.id, channelId))) {
      return res.status(403).json({ error: "No access to channel" });
    }
    const format = req.query.format || "json";
    const exportMaxMessages = Number(process.env.EXPORT_MAX_MESSAGES || 10000);
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM messages
       WHERE channel_id = $1`,
      [channelId]
    );
    const total = Number(countRes.rows[0]?.total || 0);
    if (total > exportMaxMessages) {
      return res.status(413).json({
        error: `Export too large. Maximum ${exportMaxMessages} messages per export.`,
      });
    }
    const result = await pool.query(
      `SELECT m.id, m.channel_id, m.user_id, u.username, u.avatar_url, m.content, m.image_url, m.created_at, m.is_pinned, m.pinned_at
       FROM messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.channel_id = $1
       ORDER BY m.created_at ASC`,
      [channelId]
    );
    const rows = (await withReactionsOnMessages(result.rows, req.user.id)).map((m) =>
      sanitizeUserMediaFields(sanitizeImageUrlField(m))
    );
    if (format === "csv") {
      const esc = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      const header = [
        "id",
        "channel_id",
        "user_id",
        "username",
        "content",
        "image_url",
        "created_at",
        "is_pinned",
        "pinned_at",
        "reactions",
      ].join(",");
      const body = rows
        .map((m) =>
          [
            m.id,
            m.channel_id,
            m.user_id,
            esc(m.username),
            esc(m.content),
            esc(m.image_url),
            esc(m.created_at),
            m.is_pinned ? "true" : "false",
            esc(m.pinned_at),
            esc(JSON.stringify(m.reactions || [])),
          ].join(",")
        )
        .join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="channel-${channelId}-messages.csv"`);
      return res.send(`${header}\n${body}`);
    }
    res.setHeader("Content-Disposition", `attachment; filename="channel-${channelId}-messages.json"`);
    return res.json(rows);
  }
);

/** Neighbor messages in the same channel (for jump-to-context UIs). */
router.get(
  "/:messageId/context",
  validate({ params: messageIdParamSchema, query: messageContextQuerySchema }),
  async (req, res) => {
    const messageId = req.params.messageId;
    const beforeN = req.query.before != null ? Number(req.query.before) : 10;
    const afterN = req.query.after != null ? Number(req.query.after) : 10;
    const centerQ = await pool.query(`${MESSAGE_LIST_SELECT} WHERE m.id = $1`, [messageId]);
    if (!centerQ.rows.length) {
      return res.status(404).json({ error: "Message not found" });
    }
    const anchor = centerQ.rows[0];
    const channelId = anchor.channel_id;
    if (!(await canReadChannel(req.user.id, channelId))) {
      return res.status(403).json({ error: "No access to channel" });
    }
    const beforeQ = await pool.query(
      `${MESSAGE_LIST_SELECT}
       WHERE m.channel_id = $1 AND m.id < $2
       ORDER BY m.id DESC
       LIMIT $3`,
      [channelId, messageId, beforeN]
    );
    const afterQ = await pool.query(
      `${MESSAGE_LIST_SELECT}
       WHERE m.channel_id = $1 AND m.id > $2
       ORDER BY m.id ASC
       LIMIT $3`,
      [channelId, messageId, afterN]
    );
    const beforeChrono = beforeQ.rows.reverse();
    const combined = [...beforeChrono, anchor, ...afterQ.rows];
    const enriched = await withReactionsOnMessages(combined, req.user.id);
    const mapped = enriched.map((m) => sanitizeUserMediaFields(sanitizeImageUrlField(m)));
    res.json({
      anchor_id: Number(messageId),
      channel_id: Number(channelId),
      before_count: beforeChrono.length,
      after_count: afterQ.rows.length,
      messages: mapped,
    });
  }
);

router.delete("/:messageId", validate({ params: messageIdParamSchema }), async (req, res) => {
  const messageId = req.params.messageId;
  const row = await pool.query(
    `SELECT id, user_id, channel_id
     FROM messages
     WHERE id = $1`,
    [messageId]
  );
  if (!row.rows.length) {
    return res.status(404).json({ error: "Message not found" });
  }
  const msg = row.rows[0];
  if (!(await canReadChannel(req.user.id, msg.channel_id))) {
    return res.status(403).json({ error: "No access to channel" });
  }
  const serverId = await getChannelServerId(msg.channel_id);
  const canManage = serverId ? await canManageChannels(req.user.id, serverId) : false;
  const isOwner = Number(msg.user_id) === Number(req.user.id);
  if (!isOwner && !canManage) {
    return res.status(403).json({ error: "Cannot delete this message" });
  }
  await pool.query("DELETE FROM messages WHERE id = $1", [messageId]);
  if (canManage && !isOwner) {
    await logAdminAction({
      actorUserId: req.user.id,
      action: "message_delete_moderation",
      targetMessageId: Number(messageId),
      channelId: Number(msg.channel_id),
      serverId: serverId ? Number(serverId) : null,
      metadata: { owner_user_id: Number(msg.user_id) },
    });
  }
  res.json({ deleted: true, id: messageId, channel_id: msg.channel_id });
});

router.patch(
  "/:messageId",
  userDataRateLimiter,
  validate({ params: messageIdParamSchema, body: editMessageBodySchema }),
  async (req, res) => {
    const messageId = req.params.messageId;
    const content = req.body.content.trim();
    if (textContainsBlockedLanguage(content, { source: "rest_patch_message", userId: req.user.id })) {
      return res.status(400).json({ error: "blocked_content", message: "This content contains prohibited language." });
    }
    const row = await pool.query(
      `SELECT id, user_id, channel_id
       FROM messages
       WHERE id = $1`,
      [messageId]
    );
    if (!row.rows.length) {
      return res.status(404).json({ error: "Message not found" });
    }
    const msg = row.rows[0];
    if (Number(msg.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: "You can only edit your own messages" });
    }
    if (!(await canReadChannel(req.user.id, msg.channel_id))) {
      return res.status(403).json({ error: "No access to channel" });
    }
    const updated = await pool.query(
      `UPDATE messages
       SET content = $2, edited_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [messageId, content]
    );
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
      io.to(`channel:${msg.channel_id}`).emit("message_updated", payload);
    }
    res.json(payload);
  }
);

router.post("/:messageId/pin", validate({ params: messageIdParamSchema }), async (req, res) => {
  const messageId = req.params.messageId;
  const row = await pool.query(
    `SELECT id, channel_id
     FROM messages
     WHERE id = $1`,
    [messageId]
  );
  if (!row.rows.length) {
    return res.status(404).json({ error: "Message not found" });
  }
  const msg = row.rows[0];
  const serverId = await getChannelServerId(msg.channel_id);
  if (!serverId || !(await canManageChannels(req.user.id, serverId))) {
    return res.status(403).json({ error: "Insufficient role to pin messages" });
  }
  const updated = await pool.query(
    `UPDATE messages
     SET is_pinned = true, pinned_at = NOW(), pinned_by = $2
     WHERE id = $1
     RETURNING *`,
    [messageId, req.user.id]
  );
  await logAdminAction({
    actorUserId: req.user.id,
    action: "message_pin",
    targetMessageId: Number(messageId),
    channelId: Number(msg.channel_id),
    serverId: Number(serverId),
  });
  res.json(updated.rows[0]);
});

router.post("/:messageId/unpin", validate({ params: messageIdParamSchema }), async (req, res) => {
  const messageId = req.params.messageId;
  const row = await pool.query(
    `SELECT id, channel_id
     FROM messages
     WHERE id = $1`,
    [messageId]
  );
  if (!row.rows.length) {
    return res.status(404).json({ error: "Message not found" });
  }
  const msg = row.rows[0];
  const serverId = await getChannelServerId(msg.channel_id);
  if (!serverId || !(await canManageChannels(req.user.id, serverId))) {
    return res.status(403).json({ error: "Insufficient role to unpin messages" });
  }
  const updated = await pool.query(
    `UPDATE messages
     SET is_pinned = false, pinned_at = NULL, pinned_by = NULL
     WHERE id = $1
     RETURNING *`,
    [messageId]
  );
  await logAdminAction({
    actorUserId: req.user.id,
    action: "message_unpin",
    targetMessageId: Number(messageId),
    channelId: Number(msg.channel_id),
    serverId: Number(serverId),
  });
  res.json(updated.rows[0]);
});

router.get("/:messageId/reactions", validate({ params: messageIdParamSchema }), async (req, res) => {
  const messageId = req.params.messageId;
  const row = await pool.query("SELECT id, channel_id FROM messages WHERE id = $1", [messageId]);
  if (!row.rows.length) {
    return res.status(404).json({ error: "Message not found" });
  }
  if (!(await canReadChannel(req.user.id, row.rows[0].channel_id))) {
    return res.status(403).json({ error: "No access to channel" });
  }
  const reactions = await getMessageReactions(Number(messageId), Number(req.user.id));
  res.json(reactions);
});

router.post(
  "/:messageId/reactions",
  reactionRateLimiter,
  validate({ params: messageIdParamSchema, body: reactionBodySchema }),
  async (req, res) => {
    const messageId = req.params.messageId;
    const reactionKey = req.body.reaction_key;
    const row = await pool.query("SELECT id, channel_id FROM messages WHERE id = $1", [messageId]);
    if (!row.rows.length) {
      return res.status(404).json({ error: "Message not found" });
    }
    if (!(await canReadChannel(req.user.id, row.rows[0].channel_id))) {
      return res.status(403).json({ error: "No access to channel" });
    }
    await pool.query(
      `INSERT INTO message_reactions (message_id, user_id, reaction_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id, reaction_key) DO NOTHING`,
      [messageId, req.user.id, reactionKey]
    );
    res.json({ ok: true });
  }
);

router.delete(
  "/:messageId/reactions",
  reactionRateLimiter,
  validate({ params: messageIdParamSchema, body: reactionBodySchema }),
  async (req, res) => {
    const messageId = req.params.messageId;
    const reactionKey = req.body.reaction_key;
    const row = await pool.query("SELECT id, channel_id FROM messages WHERE id = $1", [messageId]);
    if (!row.rows.length) {
      return res.status(404).json({ error: "Message not found" });
    }
    if (!(await canReadChannel(req.user.id, row.rows[0].channel_id))) {
      return res.status(403).json({ error: "No access to channel" });
    }
    await pool.query(
      `DELETE FROM message_reactions
       WHERE message_id = $1 AND user_id = $2 AND reaction_key = $3`,
      [messageId, req.user.id, reactionKey]
    );
    res.json({ ok: true });
  }
);

router.post(
  "/:messageId/report",
  reportRateLimiter,
  validate({ params: messageIdParamSchema, body: reportBodySchema }),
  async (req, res) => {
    const messageId = req.params.messageId;
    const row = await pool.query(
      `SELECT id, channel_id, user_id
       FROM messages
       WHERE id = $1`,
      [messageId]
    );
    if (!row.rows.length) {
      return res.status(404).json({ error: "Message not found" });
    }
    const msg = row.rows[0];
    if (!(await canReadChannel(req.user.id, msg.channel_id))) {
      return res.status(403).json({ error: "No access to channel" });
    }
    const serverId = await getChannelServerId(msg.channel_id);
    await logAdminAction({
      actorUserId: req.user.id,
      action: "message_report_user",
      targetMessageId: Number(messageId),
      channelId: Number(msg.channel_id),
      serverId: serverId ? Number(serverId) : null,
      metadata: {
        reason: req.body.reason,
        details: req.body.details || null,
        reported_user_id: Number(msg.user_id),
      },
    });
    res.status(201).json({ reported: true, message_id: Number(messageId) });
  }
);

module.exports = router;
