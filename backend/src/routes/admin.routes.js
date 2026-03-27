const express = require("express");
const { z } = require("zod");
const pool = require("../config/db");
const validate = require("../middleware/validate");

const router = express.Router();

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  server_id: z.coerce.number().int().positive().optional(),
  action: z.string().trim().min(2).max(64).optional(),
  from: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), { message: "Invalid from date" }),
  to: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), { message: "Invalid to date" }),
});

router.get("/audit-logs", validate({ query: auditQuerySchema }), async (req, res) => {
  const limit = req.query.limit || 50;
  const offset = req.query.offset || 0;
  const serverId = req.query.server_id || null;
  const action = req.query.action || null;
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;

  const params = [];
  const where = [];
  if (serverId) {
    params.push(serverId);
    where.push(`a.server_id = $${params.length}`);
  }
  if (action) {
    params.push(action);
    where.push(`a.action = $${params.length}`);
  }
  if (from) {
    params.push(from);
    where.push(`a.created_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    where.push(`a.created_at <= $${params.length}`);
  }
  const countParams = [...params];
  params.push(limit);
  params.push(offset);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM admin_audit_logs a
     ${whereSql}`,
    countParams
  );
  const result = await pool.query(
    `SELECT
       a.id,
       a.action,
       a.actor_user_id,
       actor.username AS actor_username,
       a.target_message_id,
       a.channel_id,
       a.server_id,
       a.metadata,
       a.created_at
     FROM admin_audit_logs a
     JOIN users actor ON actor.id = a.actor_user_id
     ${whereSql}
     ORDER BY a.created_at DESC
     LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params
  );
  res.json({
    items: result.rows,
    total: Number(countResult.rows[0]?.total || 0),
    limit,
    offset,
  });
});

module.exports = router;
