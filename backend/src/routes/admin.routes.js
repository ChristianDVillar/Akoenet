const express = require("express");
const { z } = require("zod");
const pool = require("../config/db");
const validate = require("../middleware/validate");
const { getSnapshot } = require("../lib/runtime-metrics");

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
const reportQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  server_id: z.coerce.number().int().positive().optional(),
  status: z.enum(["all", "open", "resolved", "rejected"]).optional(),
});
const reportParamsSchema = z.object({
  auditId: z.coerce.number().int().positive(),
});
const reportUpdateSchema = z.object({
  status: z.enum(["open", "resolved", "rejected"]),
  note: z.string().trim().max(500).optional(),
});

router.get("/metrics", (_req, res) => {
  res.json(getSnapshot());
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

router.get("/reports/messages", validate({ query: reportQuerySchema }), async (req, res) => {
  const limit = req.query.limit || 50;
  const offset = req.query.offset || 0;
  const serverId = req.query.server_id || null;
  const status = req.query.status || "all";
  const params = [];
  const where = [`a.action IN ('message_report_user', 'dm_message_report_user')`];
  if (serverId) {
    params.push(serverId);
    where.push(`a.server_id = $${params.length}`);
  }
  if (status === "open") {
    where.push(`COALESCE(a.metadata->>'status', 'open') = 'open'`);
  } else if (status === "resolved") {
    where.push(`a.metadata->>'status' = 'resolved'`);
  } else if (status === "rejected") {
    where.push(`a.metadata->>'status' = 'rejected'`);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM admin_audit_logs a
     ${whereSql}`,
    params
  );
  const queryParams = [...params, limit, offset];
  const result = await pool.query(
    `SELECT
       a.id,
       a.action AS report_action,
       a.created_at,
       a.server_id,
       a.channel_id,
       a.target_message_id,
       a.actor_user_id AS reporter_user_id,
       reporter.username AS reporter_username,
       a.metadata,
       COALESCE(m.content, dm.content) AS message_content,
       COALESCE(m.image_url, dm.image_url) AS message_image_url,
       COALESCE(m.created_at, dm.created_at) AS message_created_at,
       reported.id AS reported_user_id,
       reported.username AS reported_username
     FROM admin_audit_logs a
     JOIN users reporter ON reporter.id = a.actor_user_id
     LEFT JOIN messages m ON m.id = a.target_message_id AND a.action = 'message_report_user'
     LEFT JOIN direct_messages dm ON dm.id = a.target_message_id AND a.action = 'dm_message_report_user'
     LEFT JOIN users reported ON reported.id = NULLIF((a.metadata->>'reported_user_id')::int, 0)
     ${whereSql}
     ORDER BY a.created_at DESC
     LIMIT $${queryParams.length - 1}
     OFFSET $${queryParams.length}`,
    queryParams
  );
  res.json({
    items: result.rows,
    total: Number(countResult.rows[0]?.total || 0),
    limit,
    offset,
  });
});

router.patch(
  "/reports/messages/:auditId",
  validate({ params: reportParamsSchema, body: reportUpdateSchema }),
  async (req, res) => {
    const auditId = req.params.auditId;
    const status = req.body.status;
    const note = req.body.note || null;
    const updated = await pool.query(
      `UPDATE admin_audit_logs a
       SET metadata = a.metadata
         || jsonb_build_object(
            'status', $2::text,
            'moderator_note', $3::text,
            'reviewed_at', NOW()::text,
            'reviewed_by', $4::int
          )
       WHERE a.id = $1
         AND a.action IN ('message_report_user', 'dm_message_report_user')
       RETURNING a.*`,
      [auditId, status, note, req.user.id]
    );
    if (!updated.rows.length) {
      return res.status(404).json({ error: "Report not found" });
    }
    res.json({ ok: true, item: updated.rows[0] });
  }
);

module.exports = router;
