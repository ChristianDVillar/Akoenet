const express = require("express");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const { isServerMember } = require("../lib/membership");

const router = express.Router();
router.use(auth);

router.post("/", async (req, res) => {
  const { name, server_id, type = "text" } = req.body;
  if (!name || !server_id) {
    return res.status(400).json({ error: "name and server_id required" });
  }
  if (!(await isServerMember(req.user.id, server_id))) {
    return res.status(403).json({ error: "Not a member of this server" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO channels (name, server_id, type) VALUES ($1, $2, $3) RETURNING *`,
      [String(name).trim(), server_id, type]
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
    `SELECT * FROM channels WHERE server_id = $1 ORDER BY id ASC`,
    [serverId]
  );
  res.json(result.rows);
});

module.exports = router;
