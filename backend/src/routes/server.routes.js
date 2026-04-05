const express = require("express");
const crypto = require("crypto");
const { z } = require("zod");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const logger = require("../lib/logger");
const {
  canManageChannels,
  isServerMember,
  getActiveServerBan,
  isUserBannedInServer,
} = require("../lib/membership");
const {
  getVoicePresenceSnapshotForServer,
  getConnectedUserIdsGlobal,
} = require("../sockets/chat.socket");
const { postJoinWelcomeMessage } = require("../lib/join-welcome-message");

const { sanitizeUserMediaFields, sanitizeImageUrlField } = require("../lib/sanitize-media-url");
const { shapeMemberRowForPublicApi } = require("../lib/game-activity");
const { cacheGet, cacheSet } = require("../lib/redis-cache");

const router = express.Router();
const hiddenServerName = (process.env.HIDDEN_SYSTEM_SERVER_NAME || "AkoeNet").trim().toLowerCase();
const createServerSchema = z.object({
  name: z.string().trim().min(2).max(80),
});
const serverIdParamSchema = z.object({
  serverId: z.coerce.number().int().positive(),
});
const createInviteSchema = z.object({
  max_uses: z.coerce.number().int().positive().max(1000).optional().nullable(),
  expires_in_hours: z.coerce.number().int().positive().max(24 * 30).optional().nullable(),
});
const createEmojiSchema = z.object({
  name: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,32}$/),
  image_url: z.string().trim().max(2000),
});
const emojiIdParamSchema = z.object({
  serverId: z.coerce.number().int().positive(),
  emojiId: z.coerce.number().int().positive(),
});
const inviteTokenParamSchema = z.object({
  token: z.string().min(10).max(128),
});
const inviteIdParamSchema = z.object({
  serverId: z.coerce.number().int().positive(),
  inviteId: z.coerce.number().int().positive(),
});
const webhookIdParamSchema = z.object({
  serverId: z.coerce.number().int().positive(),
  webhookId: z.coerce.number().int().positive(),
});
const createWebhookSchema = z.object({
  url: z.string().trim().url().max(2000),
  event_types: z.array(z.enum(["message.create"])).optional(),
});
const banUserSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  reason: z.string().trim().max(500).optional().nullable(),
  expires_at: z.string().trim().datetime({ offset: true }).optional().nullable(),
});
const banUserParamSchema = z.object({
  serverId: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
});

/** Public: invite landing page (no auth). */
router.get("/invite/:token/preview", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (token.length < 10 || token.length > 128) {
    return res.status(400).json({ error: "invalid_token" });
  }
  try {
    const result = await pool.query(
      `SELECT s.id AS server_id, s.name AS server_name, s.is_system
       FROM server_invites i
       JOIN servers s ON s.id = i.server_id
       WHERE i.token = $1
         AND i.is_active = true
         AND (i.expires_at IS NULL OR i.expires_at > NOW())
         AND (i.max_uses IS NULL OR i.used_count < i.max_uses)
         AND COALESCE(s.is_system, false) = false
         AND LOWER(TRIM(s.name)) <> $2`,
      [token, hiddenServerName]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "invite_not_found" });
    }
    const row = result.rows[0];
    res.json({ server_id: row.server_id, server_name: row.server_name });
  } catch (e) {
    logger.error({ err: e }, "Invite preview failed");
    res.status(500).json({ error: "preview_failed" });
  }
});

router.use(auth);

router.get("/:serverId/ban-status", validate({ params: serverIdParamSchema }), async (req, res) => {
  const serverId = req.params.serverId;
  const ban = await getActiveServerBan(req.user.id, serverId);
  if (!ban) return res.json({ banned: false });
  return res.status(403).json({
    banned: true,
    reason: ban.reason || null,
    expires_at: ban.expires_at || null,
    created_at: ban.created_at || null,
  });
});

/** Live voice occupancy (same source as Socket.IO); HTTP fallback for sidebar UI */
router.get(
  "/:serverId/voice-presence",
  validate({ params: serverIdParamSchema }),
  async (req, res) => {
    const serverId = req.params.serverId;
    if (!(await isServerMember(req.user.id, serverId))) {
      return res.status(403).json({ error: "Not a member" });
    }
    try {
      const presence = await getVoicePresenceSnapshotForServer(serverId);
      res.json(presence);
    } catch (e) {
      logger.error({ err: e }, "voice-presence HTTP failed");
      res.status(500).json({ error: "Could not load voice presence" });
    }
  }
);

/** Create server, default roles, owner membership + admin role */
router.post("/", validate({ body: createServerSchema }), async (req, res) => {
  const client = await pool.connect();
  try {
    const { name } = req.body;
    await client.query("BEGIN");
    const serverResult = await client.query(
      `INSERT INTO servers (name, owner_id) VALUES ($1, $2) RETURNING *`,
      [name.trim(), req.user.id]
    );
    const server = serverResult.rows[0];

    await client.query(
      `INSERT INTO server_members (user_id, server_id) VALUES ($1, $2)`,
      [req.user.id, server.id]
    );

    const roleNames = ["admin", "moderator", "member"];
    const roleIds = {};
    for (const roleName of roleNames) {
      const rr = await client.query(
        `INSERT INTO roles (server_id, name) VALUES ($1, $2) RETURNING id`,
        [server.id, roleName]
      );
      roleIds[roleName] = rr.rows[0].id;
    }
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
      [req.user.id, roleIds.admin]
    );

    const defaultCategory = await client.query(
      `INSERT INTO channel_categories (server_id, name, position) VALUES ($1, 'General', 0) RETURNING id`,
      [server.id]
    );
    const categoryId = defaultCategory.rows[0].id;

    const generalCh = await client.query(
      `INSERT INTO channels (name, server_id, type, category_id, position) VALUES ('general', $1, 'text', $2, 0) RETURNING id`,
      [server.id, categoryId]
    );

    await client.query(
      `INSERT INTO channels (name, server_id, type, category_id, position) VALUES ('Voice Chat', $1, 'voice', $2, 1)`,
      [server.id, categoryId]
    );

    await client.query(
      `INSERT INTO channels (name, server_id, type, category_id, position) VALUES ('📅 upcoming streams', $1, 'text', $2, 2)`,
      [server.id, categoryId]
    );

    const welcomeContent = [
      `Welcome to **${name.trim()}** — your space for voice and text.`,
      ``,
      `**Streamer Scheduler:** in any text channel, type \`!schedule\` or \`!next\` to see upcoming streams (set your slug in **User Settings** → Streamer Scheduler username).`,
      `Use **📅 upcoming streams** for schedule-related notes.`,
    ].join("\n");
    await client.query(
      `INSERT INTO messages (channel_id, user_id, content, image_url) VALUES ($1, $2, $3, NULL)`,
      [generalCh.rows[0].id, req.user.id, welcomeContent]
    );

    await client.query("COMMIT");
    res.status(201).json({ ...server, roles: roleIds });
  } catch (e) {
    await client.query("ROLLBACK");
    logger.error({ err: e }, "Create server failed");
    res.status(500).json({ error: "Could not create server" });
  } finally {
    client.release();
  }
});

/** Servers the user belongs to */
router.get("/", async (req, res) => {
  const cacheKey = `servers:list:${req.user.id}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      return res.json(JSON.parse(cached));
    } catch {
      /* fall through */
    }
  }
  const result = await pool.query(
    `SELECT s.* FROM servers s
     INNER JOIN server_members m ON m.server_id = s.id
     WHERE m.user_id = $1
       AND COALESCE(s.is_system, false) = false
       AND LOWER(s.name) <> $2
     ORDER BY s.created_at ASC`,
    [req.user.id, hiddenServerName]
  );
  await cacheSet(cacheKey, JSON.stringify(result.rows), 15);
  res.json(result.rows);
});

/** Join server by id (invite flow MVP: user must know server id) */
router.post("/:serverId/join", validate({ params: serverIdParamSchema }), async (req, res) => {
  const serverId = req.params.serverId;
  if (await isUserBannedInServer(req.user.id, serverId)) {
    return res.status(403).json({ error: "banned_from_server" });
  }
  const exists = await pool.query("SELECT id, name, is_system FROM servers WHERE id = $1", [serverId]);
  if (exists.rows.length === 0) {
    return res.status(404).json({ error: "Server not found" });
  }
  if (
    String(exists.rows[0].name || "").trim().toLowerCase() === hiddenServerName ||
    Boolean(exists.rows[0].is_system)
  ) {
    return res.status(403).json({ error: "Cannot join this server" });
  }
  const memberRole = await pool.query(
    `SELECT r.id FROM roles r WHERE r.server_id = $1 AND r.name = 'member'`,
    [serverId]
  );
  if (memberRole.rows.length === 0) {
    return res.status(500).json({ error: "Server roles missing" });
  }
  try {
    await pool.query(
      `INSERT INTO server_members (user_id, server_id) VALUES ($1, $2)`,
      [req.user.id, serverId]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [req.user.id, memberRole.rows[0].id]
    );
    await postJoinWelcomeMessage({
      pool,
      io: req.app?.locals?.io,
      serverId,
      userId: req.user.id,
    });
    res.status(201).json({ joined: true, server_id: serverId });
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({ error: "Already a member" });
    }
    logger.error({ err: e }, "Join server failed");
    res.status(500).json({ error: "Join failed" });
  }
});

router.post(
  "/:serverId/invites",
  validate({ params: serverIdParamSchema, body: createInviteSchema }),
  async (req, res) => {
    const serverId = req.params.serverId;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role to create invites" });
    }
    const token = crypto.randomBytes(12).toString("base64url");
    const maxUses = req.body.max_uses ?? null;
    const expiresInHours = req.body.expires_in_hours ?? null;
    const expiresAt = expiresInHours ? new Date(Date.now() + expiresInHours * 3600 * 1000) : null;
    const result = await pool.query(
      `INSERT INTO server_invites (server_id, created_by, token, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, server_id, token, max_uses, used_count, expires_at, is_active, created_at`,
      [serverId, req.user.id, token, maxUses, expiresAt]
    );
    res.status(201).json(result.rows[0]);
  }
);

router.get("/:serverId/invites", validate({ params: serverIdParamSchema }), async (req, res) => {
  const serverId = req.params.serverId;
  if (!(await canManageChannels(req.user.id, serverId))) {
    return res.status(403).json({ error: "Insufficient role to list invites" });
  }
  const result = await pool.query(
    `SELECT id, server_id, token, max_uses, used_count, expires_at, is_active, created_at
     FROM server_invites
     WHERE server_id = $1
       AND is_active = true
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC`,
    [serverId]
  );
  res.json(result.rows);
});

router.get("/:serverId/emojis", validate({ params: serverIdParamSchema }), async (req, res) => {
  const serverId = req.params.serverId;
  const { isServerMember } = require("../lib/membership");
  if (!(await isServerMember(req.user.id, serverId))) {
    return res.status(403).json({ error: "Not a member" });
  }
  const result = await pool.query(
    `SELECT id, server_id, name, image_url, created_by, created_at
     FROM server_emojis
     WHERE server_id = $1
     ORDER BY name ASC`,
    [serverId]
  );
  res.json(result.rows.map((row) => sanitizeImageUrlField(row)));
});

router.post(
  "/:serverId/emojis",
  validate({ params: serverIdParamSchema, body: createEmojiSchema }),
  async (req, res) => {
    const serverId = req.params.serverId;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role to manage emojis" });
    }
    try {
      const result = await pool.query(
        `INSERT INTO server_emojis (server_id, name, image_url, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, server_id, name, image_url, created_by, created_at`,
        [serverId, req.body.name, req.body.image_url, req.user.id]
      );
      res.status(201).json(sanitizeImageUrlField(result.rows[0]));
    } catch (e) {
      if (e.code === "23505") {
        return res.status(409).json({ error: "Emoji name already exists in this server" });
      }
      logger.error({ err: e }, "Create emoji failed");
      res.status(500).json({ error: "Could not create emoji" });
    }
  }
);

router.delete(
  "/:serverId/invites/:inviteId",
  validate({ params: inviteIdParamSchema }),
  async (req, res) => {
    const { serverId, inviteId } = req.params;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role to revoke invites" });
    }
    const result = await pool.query(
      `UPDATE server_invites
       SET is_active = false
       WHERE id = $1 AND server_id = $2
       RETURNING id, is_active`,
      [inviteId, serverId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Invite not found" });
    }
    res.json({ revoked: true, invite_id: inviteId });
  }
);

router.delete(
  "/:serverId/emojis/:emojiId",
  validate({ params: emojiIdParamSchema }),
  async (req, res) => {
    const { serverId, emojiId } = req.params;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role to manage emojis" });
    }
    const result = await pool.query(
      `DELETE FROM server_emojis
       WHERE id = $1 AND server_id = $2
       RETURNING id`,
      [emojiId, serverId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Emoji not found" });
    }
    res.json({ deleted: true, emoji_id: emojiId });
  }
);

router.post("/invite/:token/join", validate({ params: inviteTokenParamSchema }), async (req, res) => {
  const token = req.params.token;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inviteRes = await client.query(
      `SELECT *
       FROM server_invites
       WHERE token = $1
       FOR UPDATE`,
      [token]
    );
    if (!inviteRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Invite not found" });
    }
    const invite = inviteRes.rows[0];
    if (!invite.is_active) {
      await client.query("ROLLBACK");
      return res.status(410).json({ error: "Invite is inactive" });
    }
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      await client.query("ROLLBACK");
      return res.status(410).json({ error: "Invite expired" });
    }
    if (invite.max_uses !== null && invite.used_count >= invite.max_uses) {
      await client.query("ROLLBACK");
      return res.status(410).json({ error: "Invite usage limit reached" });
    }
    const serverId = invite.server_id;
    if (await isUserBannedInServer(req.user.id, serverId)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "banned_from_server" });
    }
    const exists = await client.query("SELECT id, name, is_system FROM servers WHERE id = $1", [serverId]);
    if (exists.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Server not found" });
    }
    if (
      String(exists.rows[0].name || "").trim().toLowerCase() === hiddenServerName ||
      Boolean(exists.rows[0].is_system)
    ) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Cannot join this server" });
    }
    const memberRole = await client.query(
      `SELECT r.id FROM roles r WHERE r.server_id = $1 AND r.name = 'member'`,
      [serverId]
    );
    if (memberRole.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: "Server roles missing" });
    }
    try {
      await client.query(
        `INSERT INTO server_members (user_id, server_id) VALUES ($1, $2)`,
        [req.user.id, serverId]
      );
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [req.user.id, memberRole.rows[0].id]
      );
    } catch (e) {
      if (e.code === "23505") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Already a member" });
      }
      throw e;
    }
    await client.query(
      `UPDATE server_invites
       SET used_count = used_count + 1,
           is_active = CASE
             WHEN max_uses IS NOT NULL AND used_count + 1 >= max_uses THEN false
             ELSE is_active
           END
       WHERE id = $1`,
      [invite.id]
    );
    await client.query("COMMIT");
    await postJoinWelcomeMessage({
      pool,
      io: req.app?.locals?.io,
      serverId,
      userId: req.user.id,
    });
    res.status(201).json({ joined: true, server_id: serverId });
  } catch (e) {
    await client.query("ROLLBACK");
    logger.error({ err: e }, "Join by invite failed");
    res.status(500).json({ error: "Join failed" });
  } finally {
    client.release();
  }
});

router.get("/:serverId/bans", validate({ params: serverIdParamSchema }), async (req, res) => {
  const serverId = req.params.serverId;
  if (!(await canManageChannels(req.user.id, serverId))) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const r = await pool.query(
    `SELECT sb.id, sb.user_id, u.username, sb.reason, sb.expires_at, sb.created_at, sb.banned_by
     FROM server_bans sb
     INNER JOIN users u ON u.id = sb.user_id
     WHERE sb.server_id = $1
       AND sb.revoked_at IS NULL
       AND (sb.expires_at IS NULL OR sb.expires_at > NOW())
     ORDER BY sb.created_at DESC`,
    [serverId]
  );
  res.json(r.rows);
});

router.post(
  "/:serverId/bans",
  validate({ params: serverIdParamSchema, body: banUserSchema }),
  async (req, res) => {
    const serverId = req.params.serverId;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const targetUserId = Number(req.body.user_id);
    if (targetUserId === Number(req.user.id)) {
      return res.status(400).json({ error: "cannot_ban_self" });
    }
    const exists = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [targetUserId]);
    if (!exists.rows.length) return res.status(404).json({ error: "User not found" });

    const active = await getActiveServerBan(targetUserId, serverId);
    if (active) return res.status(409).json({ error: "already_banned" });

    const expiresAt = req.body.expires_at ? new Date(req.body.expires_at) : null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO server_bans (server_id, user_id, reason, banned_by, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, server_id, user_id, reason, banned_by, expires_at, created_at`,
        [serverId, targetUserId, req.body.reason || null, req.user.id, expiresAt]
      );
      await client.query(`DELETE FROM server_members WHERE user_id = $1 AND server_id = $2`, [targetUserId, serverId]);
      await client.query(
        `DELETE FROM user_roles ur
         USING roles r
         WHERE ur.role_id = r.id
           AND ur.user_id = $1
           AND r.server_id = $2`,
        [targetUserId, serverId]
      );
      await client.query("COMMIT");
      res.status(201).json(ins.rows[0]);
    } catch (e) {
      await client.query("ROLLBACK");
      logger.error({ err: e }, "Ban user failed");
      res.status(500).json({ error: "ban_failed" });
    } finally {
      client.release();
    }
  }
);

router.delete(
  "/:serverId/bans/:userId",
  validate({ params: banUserParamSchema }),
  async (req, res) => {
    const { serverId, userId } = req.params;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const updated = await pool.query(
      `UPDATE server_bans
       SET revoked_at = NOW(), revoked_by = $3
       WHERE server_id = $1
         AND user_id = $2
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       RETURNING id`,
      [serverId, userId, req.user.id]
    );
    if (!updated.rows.length) return res.status(404).json({ error: "active_ban_not_found" });
    res.json({ ok: true, unbanned_user_id: Number(userId) });
  }
);

/** Roles for a server (member only) */
router.get("/:serverId/roles", validate({ params: serverIdParamSchema }), async (req, res) => {
  const serverId = req.params.serverId;
  const { isServerMember } = require("../lib/membership");
  if (!(await isServerMember(req.user.id, serverId))) {
    return res.status(403).json({ error: "Not a member" });
  }
  const result = await pool.query(
    `SELECT r.id, r.name FROM roles r WHERE r.server_id = $1 ORDER BY r.id`,
    [serverId]
  );
  res.json(result.rows);
});

router.get("/:serverId/members", validate({ params: serverIdParamSchema }), async (req, res) => {
  const serverId = req.params.serverId;
  const { isServerMember } = require("../lib/membership");
  if (!(await isServerMember(req.user.id, serverId))) {
    return res.status(403).json({ error: "Not a member" });
  }
  const result = await pool.query(
    `SELECT u.id, u.username, u.avatar_url, u.presence_status,
            u.steam_id, u.share_game_activity, u.desktop_game_detect_opt_in,
            u.manual_activity_game, u.manual_activity_platform,
            ARRAY_REMOVE(ARRAY_AGG(r.name), NULL) AS roles
     FROM server_members m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id AND r.server_id = $1
     WHERE m.server_id = $1
     GROUP BY u.id
     ORDER BY u.username ASC`,
    [serverId]
  );
  const connectedSet = new Set(getConnectedUserIdsGlobal().map((id) => Number(id)));
  res.json(result.rows.map((row) => shapeMemberRowForPublicApi(row, connectedSet)));
});

/** Outgoing webhooks (manage channels permission) */
router.get(
  "/:serverId/webhooks",
  validate({ params: serverIdParamSchema }),
  async (req, res) => {
    const serverId = req.params.serverId;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const r = await pool.query(
      `SELECT id, url, event_types, created_at FROM server_webhooks WHERE server_id = $1 ORDER BY id ASC`,
      [serverId]
    );
    res.json(r.rows);
  }
);

router.post(
  "/:serverId/webhooks",
  validate({ params: serverIdParamSchema, body: createWebhookSchema }),
  async (req, res) => {
    const serverId = req.params.serverId;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const secret = crypto.randomBytes(32).toString("hex");
    const types = req.body.event_types?.length ? req.body.event_types : ["message.create"];
    const ins = await pool.query(
      `INSERT INTO server_webhooks (server_id, url, secret, event_types, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, url, event_types, created_at`,
      [serverId, req.body.url.trim(), secret, types, req.user.id]
    );
    res.status(201).json({ ...ins.rows[0], secret });
  }
);

router.delete(
  "/:serverId/webhooks/:webhookId",
  validate({ params: webhookIdParamSchema }),
  async (req, res) => {
    const { serverId, webhookId } = req.params;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await pool.query(`DELETE FROM server_webhooks WHERE id = $1 AND server_id = $2`, [webhookId, serverId]);
    res.json({ ok: true });
  }
);

module.exports = router;
