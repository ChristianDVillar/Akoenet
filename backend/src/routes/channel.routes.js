const express = require("express");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const { canManageChannels, isServerMember } = require("../lib/membership");

const router = express.Router();
router.use(auth);

router.post("/", async (req, res) => {
  const { name, server_id, type = "text", category_id = null } = req.body;
  if (!name || !server_id) {
    return res.status(400).json({ error: "name and server_id required" });
  }
  if (!["text", "voice", "forum"].includes(type)) {
    return res.status(400).json({ error: "Invalid channel type" });
  }
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
    const result = await pool.query(
      `INSERT INTO channels (name, server_id, type, category_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [String(name).trim(), server_id, type, category_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create channel" });
  }
});

router.get("/server/:serverId", async (req, res) => {
  const serverId = parseInt(req.params.serverId, 10);
  if (Number.isNaN(serverId)) {
    return res.status(400).json({ error: "Invalid server" });
  }
  if (!(await isServerMember(req.user.id, serverId))) {
    return res.status(403).json({ error: "Not a member of this server" });
  }
  const result = await pool.query(
    `SELECT * FROM channels WHERE server_id = $1 ORDER BY category_id NULLS FIRST, position ASC, id ASC`,
    [serverId]
  );
  res.json(result.rows);
});

router.get("/server/:serverId/categories", async (req, res) => {
  const serverId = parseInt(req.params.serverId, 10);
  if (Number.isNaN(serverId)) {
    return res.status(400).json({ error: "Invalid server" });
  }
  if (!(await isServerMember(req.user.id, serverId))) {
    return res.status(403).json({ error: "Not a member of this server" });
  }
  const result = await pool.query(
    `SELECT * FROM channel_categories WHERE server_id = $1 ORDER BY position ASC, id ASC`,
    [serverId]
  );
  res.json(result.rows);
});

router.post("/categories", async (req, res) => {
  const { server_id, name } = req.body;
  if (!server_id || !name) {
    return res.status(400).json({ error: "server_id and name required" });
  }
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

router.delete("/categories/:categoryId", async (req, res) => {
  const categoryId = parseInt(req.params.categoryId, 10);
  if (Number.isNaN(categoryId)) {
    return res.status(400).json({ error: "Invalid category" });
  }
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

router.post("/reorder", async (req, res) => {
  const { server_id, channel_id, target_channel_id = null, target_category_id = null } = req.body;
  if (!server_id || !channel_id) {
    return res.status(400).json({ error: "server_id and channel_id required" });
  }
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

router.post("/categories/reorder", async (req, res) => {
  const { server_id, category_id, target_category_id = null } = req.body;
  if (!server_id || !category_id) {
    return res.status(400).json({ error: "server_id and category_id required" });
  }
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

router.get("/:channelId/permissions", async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  if (Number.isNaN(channelId)) {
    return res.status(400).json({ error: "Invalid channel" });
  }
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

router.put("/:channelId/permissions", async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const { role_id, can_view, can_send, can_connect } = req.body;
  if (Number.isNaN(channelId) || !role_id) {
    return res.status(400).json({ error: "channelId and role_id required" });
  }
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

router.get("/:channelId/user-permissions", async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  if (Number.isNaN(channelId)) {
    return res.status(400).json({ error: "Invalid channel" });
  }
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

router.put("/:channelId/user-permissions/:userId", async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  const userId = parseInt(req.params.userId, 10);
  const { can_view, can_send, can_connect } = req.body;
  if (Number.isNaN(channelId) || Number.isNaN(userId)) {
    return res.status(400).json({ error: "Invalid channel or user" });
  }
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
});

router.delete("/:channelId", async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  if (Number.isNaN(channelId)) {
    return res.status(400).json({ error: "Invalid channel" });
  }
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
