const express = require("express");
const pool = require("../config/db");
const auth = require("../middleware/auth");

const router = express.Router();
const hiddenServerName = (process.env.HIDDEN_SYSTEM_SERVER_NAME || "Akonet").trim().toLowerCase();

router.use(auth);

/** Create server, default roles, owner membership + admin role */
router.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name required" });
    }
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

    await client.query(
      `INSERT INTO channels (name, server_id, type, category_id) VALUES ('general', $1, 'text', $2)`,
      [server.id, defaultCategory.rows[0].id]
    );

    await client.query("COMMIT");
    res.status(201).json({ ...server, roles: roleIds });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Could not create server" });
  } finally {
    client.release();
  }
});

/** Servers the user belongs to */
router.get("/", async (req, res) => {
  const result = await pool.query(
    `SELECT s.* FROM servers s
     INNER JOIN server_members m ON m.server_id = s.id
     WHERE m.user_id = $1
       AND COALESCE(s.is_system, false) = false
       AND LOWER(s.name) <> $2
     ORDER BY s.created_at ASC`,
    [req.user.id, hiddenServerName]
  );
  res.json(result.rows);
});

/** Join server by id (invite flow MVP: user must know server id) */
router.post("/:serverId/join", async (req, res) => {
  const serverId = parseInt(req.params.serverId, 10);
  if (Number.isNaN(serverId)) {
    return res.status(400).json({ error: "Invalid server" });
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
    res.status(201).json({ joined: true, server_id: serverId });
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({ error: "Already a member" });
    }
    console.error(e);
    res.status(500).json({ error: "Join failed" });
  }
});

/** Roles for a server (member only) */
router.get("/:serverId/roles", async (req, res) => {
  const serverId = parseInt(req.params.serverId, 10);
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

router.get("/:serverId/members", async (req, res) => {
  const serverId = parseInt(req.params.serverId, 10);
  if (Number.isNaN(serverId)) {
    return res.status(400).json({ error: "Invalid server" });
  }
  const { isServerMember } = require("../lib/membership");
  if (!(await isServerMember(req.user.id, serverId))) {
    return res.status(403).json({ error: "Not a member" });
  }
  const result = await pool.query(
    `SELECT u.id, u.username, u.avatar_url,
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
  res.json(result.rows);
});

module.exports = router;
