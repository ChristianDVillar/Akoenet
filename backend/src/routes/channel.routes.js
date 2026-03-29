const express = require("express");
const { z } = require("zod");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { canManageChannels, isServerMember, getChannelPermissionsForUser } = require("../lib/membership");

const router = express.Router();
router.use(auth);
const channelTypeSchema = z.enum(["text", "voice", "forum"]);
const boolSchema = z.boolean().optional();
const serverIdParamSchema = z.object({
  serverId: z.coerce.number().int().positive(),
});
const channelIdParamSchema = z.object({
  channelId: z.coerce.number().int().positive(),
});
const categoryIdParamSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
});
const channelUserPermissionParamSchema = z.object({
  channelId: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
});
const voiceUserLimitSchema = z.union([z.number().int().min(1).max(99), z.null()]);
const createChannelSchema = z.object({
  name: z.string().trim().min(1).max(80),
  server_id: z.coerce.number().int().positive(),
  type: channelTypeSchema.optional(),
  category_id: z.coerce.number().int().positive().optional().nullable(),
  is_private: boolSchema,
  voice_user_limit: voiceUserLimitSchema.optional(),
});
const updateChannelSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  category_id: z.coerce.number().int().positive().optional().nullable(),
  is_private: boolSchema,
  voice_user_limit: voiceUserLimitSchema.optional(),
});
const createCategorySchema = z.object({
  server_id: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(80),
});
const reorderChannelSchema = z.object({
  server_id: z.coerce.number().int().positive(),
  channel_id: z.coerce.number().int().positive(),
  target_channel_id: z.coerce.number().int().positive().optional().nullable(),
  target_category_id: z.coerce.number().int().positive().optional().nullable(),
});
const reorderCategorySchema = z.object({
  server_id: z.coerce.number().int().positive(),
  category_id: z.coerce.number().int().positive(),
  target_category_id: z.coerce.number().int().positive().optional().nullable(),
});
const rolePermissionSchema = z.object({
  role_id: z.coerce.number().int().positive(),
  can_view: boolSchema,
  can_send: boolSchema,
  can_connect: boolSchema,
});
const userPermissionSchema = z.object({
  can_view: boolSchema,
  can_send: boolSchema,
  can_connect: boolSchema,
});

router.post("/", validate({ body: createChannelSchema }), async (req, res) => {
  const { name, server_id, type = "text", category_id = null, is_private = false, voice_user_limit } = req.body;
  if (!(await isServerMember(req.user.id, server_id))) {
    return res.status(403).json({ error: "Not a member of this server" });
  }
  if (!(await canManageChannels(req.user.id, server_id))) {
    return res.status(403).json({ error: "Insufficient role to create channels" });
  }
  try {
    if (category_id) {
      const category = await pool.query(
        "SELECT id, server_id FROM channel_categories WHERE id = $1",
        [category_id]
      );
      if (!category.rows.length || category.rows[0].server_id !== Number(server_id)) {
        return res.status(400).json({ error: "Invalid category for server" });
      }
    }
    let vLimit = null;
    if (type === "voice" && voice_user_limit != null) {
      vLimit = Number(voice_user_limit);
    }
    const result = await pool.query(
      `INSERT INTO channels (name, server_id, type, category_id, is_private, voice_user_limit) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [String(name).trim(), server_id, type, category_id, Boolean(is_private), vLimit]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create channel" });
  }
});

router.get("/server/:serverId", validate({ params: serverIdParamSchema }), async (req, res) => {
  const serverId = req.params.serverId;
  if (!(await isServerMember(req.user.id, serverId))) {
    return res.status(403).json({ error: "Not a member of this server" });
  }
  const result = await pool.query(
    `SELECT * FROM channels WHERE server_id = $1 ORDER BY category_id NULLS FIRST, position ASC, id ASC`,
    [serverId]
  );
  const visibleChannels = [];
  for (const channel of result.rows) {
    const permissions = await getChannelPermissionsForUser(req.user.id, channel.id);
    if (permissions.can_view) visibleChannels.push(channel);
  }
  res.json(visibleChannels);
});

router.put("/:channelId", validate({ params: channelIdParamSchema, body: updateChannelSchema }), async (req, res) => {
  const channelId = req.params.channelId;
  const { name, category_id, is_private, voice_user_limit } = req.body;
  const ch = await pool.query(
    "SELECT id, server_id, type FROM channels WHERE id = $1",
    [channelId]
  );
  if (!ch.rows.length) return res.status(404).json({ error: "Channel not found" });
  const serverId = ch.rows[0].server_id;
  const channelType = ch.rows[0].type;
  if (!(await canManageChannels(req.user.id, serverId))) {
    return res.status(403).json({ error: "Insufficient role to update channel" });
  }
  if (voice_user_limit !== undefined && channelType !== "voice") {
    return res.status(400).json({ error: "User limit applies to voice channels only" });
  }
  if (category_id !== undefined && category_id !== null) {
    const category = await pool.query(
      "SELECT id, server_id FROM channel_categories WHERE id = $1",
      [category_id]
    );
    if (!category.rows.length || category.rows[0].server_id !== Number(serverId)) {
      return res.status(400).json({ error: "Invalid category for server" });
    }
  }
  const result = await pool.query(
    `UPDATE channels
       SET name = COALESCE($1, name),
           category_id = CASE WHEN $4 THEN $2::int ELSE category_id END,
           is_private = COALESCE($3, is_private),
           voice_user_limit = CASE WHEN $6 THEN $5::int ELSE voice_user_limit END
     WHERE id = $7
     RETURNING *`,
    [
      name !== undefined ? String(name).trim() : null,
      category_id ?? null,
      is_private,
      category_id !== undefined,
      voice_user_limit !== undefined ? voice_user_limit : null,
      voice_user_limit !== undefined,
      channelId,
    ]
  );
  res.json(result.rows[0]);
});

router.get("/server/:serverId/categories", validate({ params: serverIdParamSchema }), async (req, res) => {
  const serverId = req.params.serverId;
  if (!(await isServerMember(req.user.id, serverId))) {
    return res.status(403).json({ error: "Not a member of this server" });
  }
  const result = await pool.query(
    `SELECT * FROM channel_categories WHERE server_id = $1 ORDER BY position ASC, id ASC`,
    [serverId]
  );
  res.json(result.rows);
});

router.post("/categories", validate({ body: createCategorySchema }), async (req, res) => {
  const { server_id, name } = req.body;
  if (!(await isServerMember(req.user.id, server_id))) {
    return res.status(403).json({ error: "Not a member of this server" });
  }
  if (!(await canManageChannels(req.user.id, server_id))) {
    return res.status(403).json({ error: "Insufficient role to create categories" });
  }
  const result = await pool.query(
    `INSERT INTO channel_categories (server_id, name) VALUES ($1, $2) RETURNING *`,
    [server_id, String(name).trim()]
  );
  res.status(201).json(result.rows[0]);
});

router.delete("/categories/:categoryId", validate({ params: categoryIdParamSchema }), async (req, res) => {
  const categoryId = req.params.categoryId;
  const category = await pool.query(
    "SELECT id, server_id FROM channel_categories WHERE id = $1",
    [categoryId]
  );
  if (!category.rows.length) {
    return res.status(404).json({ error: "Category not found" });
  }
  const serverId = category.rows[0].server_id;
  if (!(await canManageChannels(req.user.id, serverId))) {
    return res.status(403).json({ error: "Insufficient role to delete categories" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE channels SET category_id = NULL WHERE category_id = $1",
      [categoryId]
    );
    await client.query("DELETE FROM channel_categories WHERE id = $1", [categoryId]);
    await client.query("COMMIT");
    res.json({ ok: true, deleted_category_id: categoryId });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Could not delete category" });
  } finally {
    client.release();
  }
});

router.post("/reorder", validate({ body: reorderChannelSchema }), async (req, res) => {
  const { server_id, channel_id, target_channel_id = null, target_category_id = null } = req.body;
  if (!(await isServerMember(req.user.id, server_id))) {
    return res.status(403).json({ error: "Not a member of this server" });
  }
  if (!(await canManageChannels(req.user.id, server_id))) {
    return res.status(403).json({ error: "Insufficient role to reorder" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ch = await client.query(
      "SELECT id, server_id FROM channels WHERE id = $1",
      [channel_id]
    );
    if (!ch.rows.length || ch.rows[0].server_id !== Number(server_id)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Invalid channel for server" });
    }

    let newPosition = 0;
    if (target_channel_id) {
      const target = await client.query(
        "SELECT position FROM channels WHERE id = $1 AND server_id = $2",
        [target_channel_id, server_id]
      );
      if (!target.rows.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Target channel not found" });
      }
      newPosition = target.rows[0].position;
    } else {
      const maxPos = await client.query(
        `SELECT COALESCE(MAX(position), -1) AS max_pos
         FROM channels
         WHERE server_id = $1 AND category_id IS NOT DISTINCT FROM $2`,
        [server_id, target_category_id]
      );
      newPosition = Number(maxPos.rows[0].max_pos) + 1;
    }

    await client.query(
      `UPDATE channels
       SET position = position + 1
       WHERE server_id = $1
         AND category_id IS NOT DISTINCT FROM $2
         AND id <> $3
         AND position >= $4`,
      [server_id, target_category_id, channel_id, newPosition]
    );
    await client.query(
      `UPDATE channels SET category_id = $1, position = $2 WHERE id = $3`,
      [target_category_id, newPosition, channel_id]
    );
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Reorder failed" });
  } finally {
    client.release();
  }
});

router.post("/categories/reorder", validate({ body: reorderCategorySchema }), async (req, res) => {
  const { server_id, category_id, target_category_id = null } = req.body;
  if (!(await isServerMember(req.user.id, server_id))) {
    return res.status(403).json({ error: "Not a member of this server" });
  }
  if (!(await canManageChannels(req.user.id, server_id))) {
    return res.status(403).json({ error: "Insufficient role to reorder" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let newPosition = 0;
    if (target_category_id) {
      const target = await client.query(
        "SELECT position FROM channel_categories WHERE id = $1 AND server_id = $2",
        [target_category_id, server_id]
      );
      if (!target.rows.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Target category not found" });
      }
      newPosition = target.rows[0].position;
    } else {
      const maxPos = await client.query(
        `SELECT COALESCE(MAX(position), -1) AS max_pos
         FROM channel_categories
         WHERE server_id = $1`,
        [server_id]
      );
      newPosition = Number(maxPos.rows[0].max_pos) + 1;
    }
    await client.query(
      `UPDATE channel_categories
       SET position = position + 1
       WHERE server_id = $1
         AND id <> $2
         AND position >= $3`,
      [server_id, category_id, newPosition]
    );
    await client.query(
      "UPDATE channel_categories SET position = $1 WHERE id = $2 AND server_id = $3",
      [newPosition, category_id, server_id]
    );
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Category reorder failed" });
  } finally {
    client.release();
  }
});

router.get("/:channelId/permissions", validate({ params: channelIdParamSchema }), async (req, res) => {
  const channelId = req.params.channelId;
  const channel = await pool.query(
    "SELECT id, server_id FROM channels WHERE id = $1",
    [channelId]
  );
  if (!channel.rows.length) return res.status(404).json({ error: "Channel not found" });
  const serverId = channel.rows[0].server_id;
  if (!(await isServerMember(req.user.id, serverId))) {
    return res.status(403).json({ error: "Not a member of this server" });
  }
  const roles = await pool.query(
    `SELECT r.id, r.name,
            COALESCE(cp.can_view, true) AS can_view,
            COALESCE(cp.can_send, true) AS can_send,
            COALESCE(cp.can_connect, true) AS can_connect
     FROM roles r
     LEFT JOIN channel_permissions cp
       ON cp.role_id = r.id AND cp.channel_id = $1
     WHERE r.server_id = $2
     ORDER BY r.id`,
    [channelId, serverId]
  );
  res.json(roles.rows);
});

router.put("/:channelId/permissions", validate({ params: channelIdParamSchema, body: rolePermissionSchema }), async (req, res) => {
  const channelId = req.params.channelId;
  const { role_id, can_view, can_send, can_connect } = req.body;
  const channel = await pool.query(
    "SELECT id, server_id FROM channels WHERE id = $1",
    [channelId]
  );
  if (!channel.rows.length) return res.status(404).json({ error: "Channel not found" });
  const serverId = channel.rows[0].server_id;
  if (!(await canManageChannels(req.user.id, serverId))) {
    return res.status(403).json({ error: "Insufficient role to update permissions" });
  }
  const role = await pool.query(
    "SELECT id FROM roles WHERE id = $1 AND server_id = $2",
    [role_id, serverId]
  );
  if (!role.rows.length) {
    return res.status(400).json({ error: "Role does not belong to server" });
  }
  const result = await pool.query(
    `INSERT INTO channel_permissions (channel_id, role_id, can_view, can_send, can_connect)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (channel_id, role_id)
     DO UPDATE SET can_view = EXCLUDED.can_view,
                   can_send = EXCLUDED.can_send,
                   can_connect = EXCLUDED.can_connect
     RETURNING *`,
    [channelId, role_id, Boolean(can_view), Boolean(can_send), Boolean(can_connect)]
  );
  res.json(result.rows[0]);
});

router.get("/:channelId/user-permissions", validate({ params: channelIdParamSchema }), async (req, res) => {
  const channelId = req.params.channelId;
  const channel = await pool.query(
    "SELECT id, server_id FROM channels WHERE id = $1",
    [channelId]
  );
  if (!channel.rows.length) return res.status(404).json({ error: "Channel not found" });
  const serverId = channel.rows[0].server_id;
  if (!(await isServerMember(req.user.id, serverId))) {
    return res.status(403).json({ error: "Not a member of this server" });
  }
  const result = await pool.query(
    `SELECT cup.user_id, u.username, cup.can_view, cup.can_send, cup.can_connect
     FROM channel_user_permissions cup
     JOIN users u ON u.id = cup.user_id
     WHERE cup.channel_id = $1
     ORDER BY u.username ASC`,
    [channelId]
  );
  res.json(result.rows);
});

router.put(
  "/:channelId/user-permissions/:userId",
  validate({ params: channelUserPermissionParamSchema, body: userPermissionSchema }),
  async (req, res) => {
  const channelId = req.params.channelId;
  const userId = req.params.userId;
  const { can_view, can_send, can_connect } = req.body;
  const channel = await pool.query(
    "SELECT id, server_id FROM channels WHERE id = $1",
    [channelId]
  );
  if (!channel.rows.length) return res.status(404).json({ error: "Channel not found" });
  const serverId = channel.rows[0].server_id;
  if (!(await canManageChannels(req.user.id, serverId))) {
    return res.status(403).json({ error: "Insufficient role to update user permissions" });
  }
  const isMember = await pool.query(
    "SELECT 1 FROM server_members WHERE user_id = $1 AND server_id = $2",
    [userId, serverId]
  );
  if (!isMember.rows.length) {
    return res.status(400).json({ error: "User is not member of this server" });
  }
  const result = await pool.query(
    `INSERT INTO channel_user_permissions (channel_id, user_id, can_view, can_send, can_connect)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (channel_id, user_id)
     DO UPDATE SET can_view = EXCLUDED.can_view,
                   can_send = EXCLUDED.can_send,
                   can_connect = EXCLUDED.can_connect
     RETURNING *`,
    [channelId, userId, Boolean(can_view), Boolean(can_send), Boolean(can_connect)]
  );
  res.json(result.rows[0]);
}
);

router.delete("/:channelId", validate({ params: channelIdParamSchema }), async (req, res) => {
  const channelId = req.params.channelId;
  const ch = await pool.query(
    "SELECT id, server_id, name FROM channels WHERE id = $1",
    [channelId]
  );
  if (!ch.rows.length) {
    return res.status(404).json({ error: "Channel not found" });
  }
  const serverId = ch.rows[0].server_id;
  if (!(await canManageChannels(req.user.id, serverId))) {
    return res.status(403).json({ error: "Insufficient role to delete channel" });
  }
  await pool.query("DELETE FROM channels WHERE id = $1", [channelId]);
  res.json({ ok: true, deleted_channel_id: channelId });
});

module.exports = router;
