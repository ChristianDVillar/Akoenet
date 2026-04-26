const express = require("express");
const crypto = require("crypto");
const { z } = require("zod");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const requireTermsAccepted = require("../middleware/require-terms");
const validate = require("../middleware/validate");
const logger = require("../lib/logger");
const {
  canManageChannels,
  canManageMemberRoles,
  canSendToChannel,
  isServerMember,
  getActiveServerBan,
  isUserBannedInServer,
  getUserServerPermissionKeys,
} = require("../lib/membership");
const {
  PERMISSION_KEYS,
  SYSTEM_SLUGS,
  sanitizePermissionList,
  replaceRolePermissionsForRole,
  seedBuiltinRolePermissions,
  isSystemSlug,
} = require("../lib/server-permissions");
const { broadcastChannelMessage } = require("../lib/channel-message-broadcast");
const { textContainsBlockedLanguage } = require("../lib/blocked-content");
const {
  isReservedServerCommandName,
  normalizeCustomCommandActionType,
} = require("../lib/custom-server-command");
const {
  getVoicePresenceSnapshotForServer,
  getConnectedUserIdsGlobal,
} = require("../sockets/chat.socket");
const { postJoinWelcomeMessage } = require("../lib/join-welcome-message");

const { sanitizeImageUrlField } = require("../lib/sanitize-media-url");
const { shapeMemberRowForPublicApi } = require("../lib/game-activity");
const { cacheGet, cacheSet } = require("../lib/redis-cache");
const { appEvents } = require("../lib/app-events");

const router = express.Router();
const hiddenServerName = (process.env.HIDDEN_SYSTEM_SERVER_NAME || "AkoeNet").trim().toLowerCase();
const createServerSchema = z.object({
  name: z.string().trim().min(2).max(80),
});
const patchServerTagSchema = z.object({
  tag: z.union([
    z.null(),
    z.literal("").transform(() => null),
    z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9]{2,4}$/)
      .transform((s) => s.toLowerCase()),
  ]),
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
const memberRolesParamSchema = z.object({
  serverId: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
});
const patchMemberRoleBodySchema = z.object({
  /** Rol interno (`slug`): admin | moderator | member */
  role: z.string().trim().min(1).max(64),
});
const serverRoleIdParamSchema = z.object({
  serverId: z.coerce.number().int().positive(),
  roleId: z.coerce.number().int().positive(),
});
const patchRoleDisplayNameSchema = z.object({
  name: z.string().trim().min(1).max(64),
});
const createServerRoleSchema = z.object({
  name: z.string().trim().min(2).max(64),
  slug: z.string().trim().min(2).max(32).regex(/^[a-z0-9_]+$/).optional(),
  permissions: z.array(z.string().trim()).max(32).optional(),
});
const putRolePermissionsSchema = z.object({
  permissions: z.array(z.string().trim()).max(32),
});

function slugFromRoleName(name) {
  let s = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  if (s.length < 2) {
    s = `role_${Date.now().toString(36)}`;
  }
  return s.slice(0, 32);
}
const customCommandIdParamSchema = z.object({
  serverId: z.coerce.number().int().positive(),
  commandId: z.coerce.number().int().positive(),
});
const createCustomCommandSchema = z.object({
  command_name: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,32}$/),
  response: z.string().trim().min(1).max(4000),
  action_type: z.enum(["none", "ban"]).optional(),
  action_value: z.string().trim().max(200).optional().nullable(),
});
const patchCustomCommandSchema = z
  .object({
    command_name: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,32}$/).optional(),
    response: z.string().trim().min(1).max(4000).optional(),
    action_type: z.enum(["none", "ban"]).optional(),
    action_value: z.string().trim().max(200).optional().nullable(),
  })
  .refine((d) => d.command_name != null || d.response != null || d.action_type != null || d.action_value !== undefined, {
    message: "empty_patch",
  });
const serverEventIdParamSchema = z.object({
  serverId: z.coerce.number().int().positive(),
  eventId: z.coerce.number().int().positive(),
});
const createServerEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(8000).optional().nullable(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }).optional().nullable(),
});
const patchServerEventSchema = createServerEventSchema.partial();
const announcementIdParamSchema = z.object({
  serverId: z.coerce.number().int().positive(),
  announcementId: z.coerce.number().int().positive(),
});
const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000),
});
const publishAnnouncementSchema = z.object({
  channel_id: z.coerce.number().int().positive(),
});

/** Public: invite landing page (no auth). */
router.get("/invite/:token/preview", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (token.length < 10 || token.length > 128) {
    return res.status(400).json({ error: "invalid_token" });
  }
  try {
    const result = await pool.query(
      `SELECT s.id AS server_id, s.name AS server_name, s.tag AS server_tag, s.is_system
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
    res.json({
      server_id: row.server_id,
      server_name: row.server_name,
      server_tag: row.server_tag || null,
    });
  } catch (e) {
    logger.error({ err: e }, "Invite preview failed");
    res.status(500).json({ error: "preview_failed" });
  }
});

router.use(auth);
router.use(requireTermsAccepted);

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

/** Live voice occupancy — same `buildVoiceSnapshotForServer` as Socket.IO `voice:presence` (includes mic_muted, deafened) */
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
        `INSERT INTO roles (server_id, name, slug) VALUES ($1, $2, $3) RETURNING id`,
        [server.id, roleName, roleName]
      );
      roleIds[roleName] = rr.rows[0].id;
      await seedBuiltinRolePermissions(client, roleIds[roleName], roleName);
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

/** Set server tag (short identifier, unique globally, like Discord server tags) */
router.patch(
  "/:serverId",
  validate({ params: serverIdParamSchema, body: patchServerTagSchema }),
  async (req, res) => {
    const serverId = req.params.serverId;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role to update server" });
    }
    const tag = req.body.tag;
    try {
      const result = await pool.query(
        `UPDATE servers SET tag = $1 WHERE id = $2
         AND COALESCE(is_system, false) = false
         AND LOWER(TRIM(name)) <> $3
         RETURNING id, name, tag, owner_id, is_system, created_at`,
        [tag, serverId, hiddenServerName]
      );
      if (!result.rows.length) {
        return res.status(404).json({ error: "Server not found" });
      }
      res.json(result.rows[0]);
    } catch (e) {
      if (e.code === "23505") {
        return res.status(409).json({ error: "tag_taken" });
      }
      logger.error({ err: e }, "Patch server tag failed");
      res.status(500).json({ error: "Could not update server" });
    }
  }
);

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
    `SELECT r.id FROM roles r WHERE r.server_id = $1 AND r.slug = 'member'`,
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
      `SELECT r.id FROM roles r WHERE r.server_id = $1 AND r.slug = 'member'`,
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

/** Catálogo de claves de permiso (i18n en cliente). */
router.get("/:serverId/server-permission-catalog", validate({ params: serverIdParamSchema }), async (req, res) => {
  const serverId = req.params.serverId;
  if (!(await isServerMember(req.user.id, serverId))) {
    return res.status(403).json({ error: "Not a member" });
  }
  res.json({ keys: [...PERMISSION_KEYS] });
});

/** Roles for a server (member only) */
router.get("/:serverId/roles", validate({ params: serverIdParamSchema }), async (req, res) => {
  const serverId = req.params.serverId;
  const { isServerMember } = require("../lib/membership");
  if (!(await isServerMember(req.user.id, serverId))) {
    return res.status(403).json({ error: "Not a member" });
  }
  const result = await pool.query(
    `SELECT r.id, r.name, r.slug,
            COALESCE(p.permissions, ARRAY[]::text[]) AS permissions
     FROM roles r
     LEFT JOIN LATERAL (
       SELECT ARRAY_AGG(permission_key ORDER BY permission_key) AS permissions
       FROM role_server_permissions WHERE role_id = r.id
     ) p ON TRUE
     WHERE r.server_id = $1
     ORDER BY r.id`,
    [serverId]
  );
  res.json(
    result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      is_system: isSystemSlug(row.slug),
      permissions: Array.isArray(row.permissions) ? row.permissions : [],
    }))
  );
});

router.post(
  "/:serverId/roles",
  validate({ params: serverIdParamSchema, body: createServerRoleSchema }),
  async (req, res) => {
    const serverId = Number(req.params.serverId);
    if (!(await canManageMemberRoles(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role to create roles" });
    }
    const name = String(req.body.name || "").trim();
    let slug = req.body.slug ? String(req.body.slug).trim().toLowerCase() : slugFromRoleName(name);
    if (SYSTEM_SLUGS.has(slug)) {
      return res.status(400).json({ error: "reserved_slug" });
    }
    const dupSlug = await pool.query(`SELECT 1 FROM roles WHERE server_id = $1 AND slug = $2`, [serverId, slug]);
    if (dupSlug.rows.length) {
      return res.status(400).json({ error: "role_slug_taken" });
    }
    const dupName = await pool.query(
      `SELECT 1 FROM roles WHERE server_id = $1 AND LOWER(TRIM(name)) = LOWER($2)`,
      [serverId, name]
    );
    if (dupName.rows.length) {
      return res.status(400).json({ error: "role_name_taken" });
    }
    try {
      const ins = await pool.query(
        `INSERT INTO roles (server_id, name, slug) VALUES ($1, $2, $3) RETURNING id, name, slug`,
        [serverId, name, slug]
      );
      const role = ins.rows[0];
      const keys = sanitizePermissionList(req.body.permissions || []);
      await replaceRolePermissionsForRole(role.id, keys);
      const permRes = await pool.query(
        `SELECT ARRAY_AGG(permission_key ORDER BY permission_key) AS permissions
         FROM role_server_permissions WHERE role_id = $1`,
        [role.id]
      );
      const permissions = permRes.rows[0]?.permissions || [];
      res.status(201).json({
        ...role,
        is_system: false,
        permissions: Array.isArray(permissions) ? permissions : [],
      });
    } catch (e) {
      logger.error({ err: e }, "Create server role failed");
      res.status(500).json({ error: "Could not create role" });
    }
  }
);

router.delete(
  "/:serverId/roles/:roleId",
  validate({ params: serverRoleIdParamSchema }),
  async (req, res) => {
    const serverId = Number(req.params.serverId);
    const roleId = Number(req.params.roleId);
    if (!(await canManageMemberRoles(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role to delete roles" });
    }
    const existing = await pool.query(`SELECT id, slug FROM roles WHERE id = $1 AND server_id = $2`, [
      roleId,
      serverId,
    ]);
    if (!existing.rows.length) {
      return res.status(404).json({ error: "role_not_found" });
    }
    if (isSystemSlug(existing.rows[0].slug)) {
      return res.status(400).json({ error: "cannot_delete_system_role" });
    }
    const used = await pool.query(
      `SELECT 1 FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE r.server_id = $1 AND ur.role_id = $2 LIMIT 1`,
      [serverId, roleId]
    );
    if (used.rows.length) {
      return res.status(400).json({ error: "role_in_use" });
    }
    await pool.query(`DELETE FROM roles WHERE id = $1 AND server_id = $2`, [roleId, serverId]);
    res.json({ ok: true });
  }
);

router.put(
  "/:serverId/roles/:roleId/permissions",
  validate({
    params: serverRoleIdParamSchema,
    body: putRolePermissionsSchema,
  }),
  async (req, res) => {
    const serverId = Number(req.params.serverId);
    const roleId = Number(req.params.roleId);
    if (!(await canManageMemberRoles(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role to edit role permissions" });
    }
    const existing = await pool.query(`SELECT id FROM roles WHERE id = $1 AND server_id = $2`, [roleId, serverId]);
    if (!existing.rows.length) {
      return res.status(404).json({ error: "role_not_found" });
    }
    const keys = sanitizePermissionList(req.body.permissions);
    await replaceRolePermissionsForRole(roleId, keys);
    res.json({ ok: true, permissions: keys });
  }
);

router.patch(
  "/:serverId/roles/:roleId",
  validate({
    params: serverRoleIdParamSchema,
    body: patchRoleDisplayNameSchema,
  }),
  async (req, res) => {
    const serverId = Number(req.params.serverId);
    const roleId = Number(req.params.roleId);
    const name = String(req.body.name || "").trim();
    if (!(await canManageMemberRoles(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role to rename roles" });
    }
    const existing = await pool.query(`SELECT id, slug FROM roles WHERE id = $1 AND server_id = $2`, [
      roleId,
      serverId,
    ]);
    if (!existing.rows.length) {
      return res.status(404).json({ error: "role_not_found" });
    }
    const dup = await pool.query(
      `SELECT 1 FROM roles WHERE server_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND id <> $3`,
      [serverId, name, roleId]
    );
    if (dup.rows.length) {
      return res.status(400).json({ error: "role_name_taken" });
    }
    const updated = await pool.query(
      `UPDATE roles SET name = $1 WHERE id = $2 AND server_id = $3 RETURNING id, name, slug`,
      [name, roleId, serverId]
    );
    res.json(updated.rows[0]);
  }
);

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
            ARRAY_REMOVE(ARRAY_AGG(r.name), NULL) AS roles,
            ARRAY_REMOVE(ARRAY_AGG(r.slug), NULL) AS role_slugs
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

router.patch(
  "/:serverId/members/:userId/roles",
  validate({
    params: memberRolesParamSchema,
    body: patchMemberRoleBodySchema,
  }),
  async (req, res) => {
    const serverId = Number(req.params.serverId);
    const targetUserId = Number(req.params.userId);
    const roleSlug = String(req.body.role || "")
      .trim()
      .toLowerCase();
    if (!(await canManageMemberRoles(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role to manage member roles" });
    }
    const memberCheck = await pool.query(
      "SELECT 1 FROM server_members WHERE user_id = $1 AND server_id = $2",
      [targetUserId, serverId]
    );
    if (!memberCheck.rows.length) {
      return res.status(404).json({ error: "Member not found" });
    }
    const serverRow = await pool.query("SELECT owner_id FROM servers WHERE id = $1", [serverId]);
    if (!serverRow.rows.length) {
      return res.status(404).json({ error: "Server not found" });
    }
    const ownerId = Number(serverRow.rows[0].owner_id);
    if (targetUserId === ownerId && roleSlug !== "admin") {
      return res.status(400).json({ error: "cannot_change_owner_role" });
    }
    const roleRow = await pool.query(
      `SELECT id, name, slug FROM roles WHERE server_id = $1 AND slug = $2`,
      [serverId, roleSlug]
    );
    if (!roleRow.rows.length) {
      return res.status(400).json({ error: "role_not_found" });
    }
    const newRoleId = roleRow.rows[0].id;

    const targetHadAdmin = await pool.query(
      `SELECT 1 FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1 AND r.server_id = $2 AND r.slug = 'admin'`,
      [targetUserId, serverId]
    );
    if (targetHadAdmin.rows.length && roleSlug !== "admin") {
      const otherAdmins = await pool.query(
        `SELECT COUNT(*)::int AS c FROM user_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE r.server_id = $1 AND r.slug = 'admin' AND ur.user_id <> $2`,
        [serverId, targetUserId]
      );
      if ((otherAdmins.rows[0]?.c ?? 0) < 1) {
        return res.status(400).json({ error: "last_admin" });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM user_roles ur
         USING roles r
         WHERE ur.user_id = $1 AND ur.role_id = r.id AND r.server_id = $2`,
        [targetUserId, serverId]
      );
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
        [targetUserId, newRoleId]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      logger.error({ err: e }, "Patch member role failed");
      return res.status(500).json({ error: "Could not update role" });
    } finally {
      client.release();
    }

    res.json({
      ok: true,
      user_id: targetUserId,
      role: roleRow.rows[0].name,
      slug: roleRow.rows[0].slug,
    });
  }
);

router.get("/:serverId/my-permissions", validate({ params: serverIdParamSchema }), async (req, res) => {
  const serverId = req.params.serverId;
  if (!(await isServerMember(req.user.id, serverId))) {
    return res.status(403).json({ error: "Not a member" });
  }
  const can = await canManageChannels(req.user.id, serverId);
  const canRoles = await canManageMemberRoles(req.user.id, serverId);
  const serverPermissions = Array.from(await getUserServerPermissionKeys(req.user.id, serverId)).sort();
  res.json({
    can_manage_channels: can,
    can_manage_member_roles: canRoles,
    server_permissions: serverPermissions,
  });
});

router.get("/:serverId/custom-commands", validate({ params: serverIdParamSchema }), async (req, res) => {
  const serverId = req.params.serverId;
  if (!(await isServerMember(req.user.id, serverId))) {
    return res.status(403).json({ error: "Not a member" });
  }
  const r = await pool.query(
    `SELECT id, server_id, command_name, response, action_type, action_value, created_by, created_at, updated_at
     FROM server_custom_commands WHERE server_id = $1 ORDER BY command_name ASC`,
    [serverId]
  );
  res.json(r.rows);
});

router.post(
  "/:serverId/custom-commands",
  validate({ params: serverIdParamSchema, body: createCustomCommandSchema }),
  async (req, res) => {
    const serverId = req.params.serverId;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role" });
    }
    const name = req.body.command_name;
    if (isReservedServerCommandName(name)) {
      return res.status(400).json({ error: "reserved_command_name" });
    }
    if (
      textContainsBlockedLanguage(req.body.response, {
        source: "server_custom_command_create",
        userId: req.user.id,
      })
    ) {
      return res.status(400).json({ error: "blocked_content" });
    }
    try {
      const actionType = normalizeCustomCommandActionType(req.body.action_type);
      const actionValue = req.body.action_value != null ? String(req.body.action_value).trim() || null : null;
      const ins = await pool.query(
        `INSERT INTO server_custom_commands
           (server_id, command_name, response, action_type, action_value, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, server_id, command_name, response, action_type, action_value, created_by, created_at, updated_at`,
        [serverId, name, req.body.response, actionType, actionValue, req.user.id]
      );
      res.status(201).json(ins.rows[0]);
    } catch (e) {
      if (e.code === "23505") {
        return res.status(409).json({ error: "command_name_taken" });
      }
      logger.error({ err: e }, "Create custom command failed");
      res.status(500).json({ error: "Could not create command" });
    }
  }
);

router.patch(
  "/:serverId/custom-commands/:commandId",
  validate({ params: customCommandIdParamSchema, body: patchCustomCommandSchema }),
  async (req, res) => {
    const { serverId, commandId } = req.params;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role" });
    }
    const nextName = req.body.command_name;
    if (nextName != null && isReservedServerCommandName(nextName)) {
      return res.status(400).json({ error: "reserved_command_name" });
    }
    if (
      req.body.response != null &&
      textContainsBlockedLanguage(req.body.response, {
        source: "server_custom_command_patch",
        userId: req.user.id,
      })
    ) {
      return res.status(400).json({ error: "blocked_content" });
    }
    const sets = [];
    const vals = [];
    if (nextName != null) {
      sets.push(`command_name = $${vals.length + 1}`);
      vals.push(nextName);
    }
    if (req.body.response != null) {
      sets.push(`response = $${vals.length + 1}`);
      vals.push(req.body.response);
    }
    if (req.body.action_type != null) {
      sets.push(`action_type = $${vals.length + 1}`);
      vals.push(normalizeCustomCommandActionType(req.body.action_type));
    }
    if (req.body.action_value !== undefined) {
      sets.push(`action_value = $${vals.length + 1}`);
      vals.push(req.body.action_value != null ? String(req.body.action_value).trim() || null : null);
    }
    sets.push(`updated_at = NOW()`);
    const idPos = vals.length + 1;
    const sidPos = vals.length + 2;
    vals.push(commandId, serverId);
    try {
      const upd = await pool.query(
        `UPDATE server_custom_commands SET ${sets.join(", ")}
         WHERE id = $${idPos} AND server_id = $${sidPos}
         RETURNING id, server_id, command_name, response, action_type, action_value, created_by, created_at, updated_at`,
        vals
      );
      if (!upd.rows.length) return res.status(404).json({ error: "Not found" });
      res.json(upd.rows[0]);
    } catch (e) {
      if (e.code === "23505") {
        return res.status(409).json({ error: "command_name_taken" });
      }
      logger.error({ err: e }, "Patch custom command failed");
      res.status(500).json({ error: "Could not update command" });
    }
  }
);

router.delete(
  "/:serverId/custom-commands/:commandId",
  validate({ params: customCommandIdParamSchema }),
  async (req, res) => {
    const { serverId, commandId } = req.params;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role" });
    }
    const del = await pool.query(
      `DELETE FROM server_custom_commands WHERE id = $1 AND server_id = $2 RETURNING id`,
      [commandId, serverId]
    );
    if (!del.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true });
  }
);

router.get("/:serverId/events", validate({ params: serverIdParamSchema }), async (req, res) => {
  const serverId = req.params.serverId;
  if (!(await isServerMember(req.user.id, serverId))) {
    return res.status(403).json({ error: "Not a member" });
  }
  const r = await pool.query(
    `SELECT id, server_id, title, description, starts_at, ends_at, created_by, created_at
     FROM server_calendar_events
     WHERE server_id = $1
     ORDER BY starts_at ASC`,
    [serverId]
  );
  res.json(r.rows);
});

router.post(
  "/:serverId/events",
  validate({ params: serverIdParamSchema, body: createServerEventSchema }),
  async (req, res) => {
    const serverId = req.params.serverId;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role" });
    }
    const starts = new Date(req.body.starts_at);
    const ends = req.body.ends_at ? new Date(req.body.ends_at) : null;
    if (Number.isNaN(starts.getTime())) {
      return res.status(400).json({ error: "invalid_starts_at" });
    }
    if (ends && Number.isNaN(ends.getTime())) {
      return res.status(400).json({ error: "invalid_ends_at" });
    }
    if (ends && ends < starts) {
      return res.status(400).json({ error: "ends_before_starts" });
    }
    const title = req.body.title;
    const desc = req.body.description ?? null;
    if (
      textContainsBlockedLanguage(`${title}\n${desc || ""}`, {
        source: "server_event_create",
        userId: req.user.id,
      })
    ) {
      return res.status(400).json({ error: "blocked_content" });
    }
    const ins = await pool.query(
      `INSERT INTO server_calendar_events (server_id, title, description, starts_at, ends_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, server_id, title, description, starts_at, ends_at, created_by, created_at`,
      [serverId, title, desc, starts, ends, req.user.id]
    );
    res.status(201).json(ins.rows[0]);
  }
);

router.patch(
  "/:serverId/events/:eventId",
  validate({ params: serverEventIdParamSchema, body: patchServerEventSchema }),
  async (req, res) => {
    const { serverId, eventId } = req.params;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role" });
    }
    const cur = await pool.query(
      `SELECT title, description, starts_at, ends_at FROM server_calendar_events WHERE id = $1 AND server_id = $2`,
      [eventId, serverId]
    );
    if (!cur.rows.length) return res.status(404).json({ error: "Not found" });
    const row = cur.rows[0];
    const title = req.body.title != null ? req.body.title : row.title;
    const description = req.body.description !== undefined ? req.body.description : row.description;
    const starts =
      req.body.starts_at != null ? new Date(req.body.starts_at) : new Date(row.starts_at);
    const ends =
      req.body.ends_at !== undefined
        ? req.body.ends_at
          ? new Date(req.body.ends_at)
          : null
        : row.ends_at
          ? new Date(row.ends_at)
          : null;
    if (Number.isNaN(starts.getTime())) return res.status(400).json({ error: "invalid_starts_at" });
    if (ends && Number.isNaN(ends.getTime())) return res.status(400).json({ error: "invalid_ends_at" });
    if (ends && ends < starts) return res.status(400).json({ error: "ends_before_starts" });
    if (
      textContainsBlockedLanguage(`${title}\n${description || ""}`, {
        source: "server_event_patch",
        userId: req.user.id,
      })
    ) {
      return res.status(400).json({ error: "blocked_content" });
    }
    const upd = await pool.query(
      `UPDATE server_calendar_events
       SET title = $1, description = $2, starts_at = $3, ends_at = $4
       WHERE id = $5 AND server_id = $6
       RETURNING id, server_id, title, description, starts_at, ends_at, created_by, created_at`,
      [title, description, starts, ends, eventId, serverId]
    );
    res.json(upd.rows[0]);
  }
);

router.delete(
  "/:serverId/events/:eventId",
  validate({ params: serverEventIdParamSchema }),
  async (req, res) => {
    const { serverId, eventId } = req.params;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role" });
    }
    const del = await pool.query(
      `DELETE FROM server_calendar_events WHERE id = $1 AND server_id = $2 RETURNING id`,
      [eventId, serverId]
    );
    if (!del.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true });
  }
);

router.get("/:serverId/announcements", validate({ params: serverIdParamSchema }), async (req, res) => {
  const serverId = req.params.serverId;
  if (!(await isServerMember(req.user.id, serverId))) {
    return res.status(403).json({ error: "Not a member" });
  }
  const r = await pool.query(
    `SELECT id, server_id, title, body, created_by, created_at
     FROM server_announcements WHERE server_id = $1 ORDER BY created_at DESC`,
    [serverId]
  );
  res.json(r.rows);
});

router.post(
  "/:serverId/announcements",
  validate({ params: serverIdParamSchema, body: createAnnouncementSchema }),
  async (req, res) => {
    const serverId = req.params.serverId;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role" });
    }
    if (
      textContainsBlockedLanguage(`${req.body.title}\n${req.body.body}`, {
        source: "server_announcement_create",
        userId: req.user.id,
      })
    ) {
      return res.status(400).json({ error: "blocked_content" });
    }
    const ins = await pool.query(
      `INSERT INTO server_announcements (server_id, title, body, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, server_id, title, body, created_by, created_at`,
      [serverId, req.body.title, req.body.body, req.user.id]
    );
    res.status(201).json(ins.rows[0]);
  }
);

router.delete(
  "/:serverId/announcements/:announcementId",
  validate({ params: announcementIdParamSchema }),
  async (req, res) => {
    const { serverId, announcementId } = req.params;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role" });
    }
    const del = await pool.query(
      `DELETE FROM server_announcements WHERE id = $1 AND server_id = $2 RETURNING id`,
      [announcementId, serverId]
    );
    if (!del.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true });
  }
);

router.post(
  "/:serverId/announcements/:announcementId/publish",
  validate({ params: announcementIdParamSchema, body: publishAnnouncementSchema }),
  async (req, res) => {
    const { serverId, announcementId } = req.params;
    const channelId = req.body.channel_id;
    if (!(await canManageChannels(req.user.id, serverId))) {
      return res.status(403).json({ error: "Insufficient role" });
    }
    const ann = await pool.query(
      `SELECT id, title, body FROM server_announcements WHERE id = $1 AND server_id = $2`,
      [announcementId, serverId]
    );
    if (!ann.rows.length) return res.status(404).json({ error: "Not found" });
    const ch = await pool.query(`SELECT id, server_id, type FROM channels WHERE id = $1`, [channelId]);
    if (!ch.rows.length || Number(ch.rows[0].server_id) !== Number(serverId)) {
      return res.status(400).json({ error: "invalid_channel" });
    }
    if (ch.rows[0].type !== "text") {
      return res.status(400).json({ error: "channel_not_text" });
    }
    if (!(await canSendToChannel(req.user.id, channelId))) {
      return res.status(403).json({ error: "send_forbidden" });
    }
    const { title, body } = ann.rows[0];
    const content = `**${String(title).trim()}**\n\n${String(body || "").trim()}`;
    if (
      textContainsBlockedLanguage(content, {
        source: "server_announcement_publish",
        userId: req.user.id,
      })
    ) {
      return res.status(400).json({ error: "blocked_content" });
    }
    const io = req.app?.locals?.io;
    const message = await broadcastChannelMessage(io, pool, {
      channelId,
      userId: req.user.id,
      content,
    });
    appEvents.emit("message.created", {
      channelId,
      messageId: message.id,
      userId: req.user.id,
      serverId: Number(serverId),
    });
    res.status(201).json({ message, announcement_id: Number(announcementId) });
  }
);

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
