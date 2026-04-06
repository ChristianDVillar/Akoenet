const express = require("express");
const { z } = require("zod");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const requireTermsAccepted = require("../middleware/require-terms");
const validate = require("../middleware/validate");
const { sanitizeUserMediaFields } = require("../lib/sanitize-media-url");

const router = express.Router();
router.use(auth);
router.use(requireTermsAccepted);

const userIdBody = z.object({ user_id: z.coerce.number().int().positive() });
const friendshipIdParams = z.object({ id: z.coerce.number().int().positive() });

/** Outgoing + incoming friend links */
router.get("/friends", async (req, res) => {
  const uid = req.user.id;
  const result = await pool.query(
    `SELECT f.id, f.status, f.created_at,
            CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END AS peer_id,
            u.username AS peer_username,
            u.avatar_url AS peer_avatar_url
     FROM user_friendships f
     JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
     WHERE f.requester_id = $1 OR f.addressee_id = $1
     ORDER BY f.created_at DESC`,
    [uid]
  );
  res.json(result.rows.map((r) => sanitizeUserMediaFields(r)));
});

router.post("/friends/request", validate({ body: userIdBody }), async (req, res) => {
  const target = req.body.user_id;
  if (target === req.user.id) {
    return res.status(400).json({ error: "invalid_target" });
  }
  const { areUsersBlocked } = require("../lib/social-guard");
  if (await areUsersBlocked(req.user.id, target)) {
    return res.status(403).json({ error: "blocked" });
  }
  try {
    const ins = await pool.query(
      `INSERT INTO user_friendships (requester_id, addressee_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (requester_id, addressee_id) DO NOTHING
       RETURNING *`,
      [req.user.id, target]
    );
    if (!ins.rows.length) {
      return res.status(409).json({ error: "already_exists" });
    }
    res.status(201).json(ins.rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "already_exists" });
    throw e;
  }
});

router.post("/friends/:id/accept", validate({ params: friendshipIdParams }), async (req, res) => {
  const { id } = req.params;
  const r = await pool.query(
    `UPDATE user_friendships SET status = 'accepted'
     WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
     RETURNING *`,
    [id, req.user.id]
  );
  if (!r.rows.length) return res.status(404).json({ error: "not_found" });
  res.json(r.rows[0]);
});

router.delete("/friends/:id", validate({ params: friendshipIdParams }), async (req, res) => {
  const { id } = req.params;
  await pool.query(`DELETE FROM user_friendships WHERE id = $1 AND (requester_id = $2 OR addressee_id = $2)`, [
    id,
    req.user.id,
  ]);
  res.json({ ok: true });
});

router.get("/blocks", async (req, res) => {
  const r = await pool.query(
    `SELECT b.blocked_id AS user_id, u.username, u.avatar_url, b.created_at
     FROM user_blocks b
     JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = $1
     ORDER BY b.created_at DESC`,
    [req.user.id]
  );
  res.json(r.rows.map((row) => sanitizeUserMediaFields(row)));
});

router.post("/blocks", validate({ body: userIdBody }), async (req, res) => {
  const blocked = req.body.user_id;
  if (blocked === req.user.id) return res.status(400).json({ error: "invalid" });
  try {
    await pool.query(
      `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [req.user.id, blocked]
    );
    await pool.query(
      `DELETE FROM user_friendships
       WHERE (requester_id = $1 AND addressee_id = $2)
          OR (requester_id = $2 AND addressee_id = $1)`,
      [req.user.id, blocked]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "failed" });
  }
});

router.delete("/blocks/:userId", validate({ params: z.object({ userId: z.coerce.number().int().positive() }) }), async (req, res) => {
  await pool.query(`DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`, [
    req.user.id,
    req.params.userId,
  ]);
  res.json({ ok: true });
});

module.exports = router;
