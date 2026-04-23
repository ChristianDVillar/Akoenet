const express = require("express");
const fs = require("fs");
const path = require("path");
const { z } = require("zod");
const pool = require("../config/db");
const validate = require("../middleware/validate");
const { getSnapshot } = require("../lib/runtime-metrics");
const { extractMessageIdFromUrl } = require("../lib/dmca-message-id");
const logger = require("../lib/logger");
const { getPushDeliveryDebug } = require("../lib/web-push-notify");

const router = express.Router();

function pctDelta(current, previous) {
  const c = Number(current);
  const p = Number(previous);
  if (!Number.isFinite(c) || !Number.isFinite(p)) return null;
  if (p === 0) return c === 0 ? 0 : null;
  return Math.round(((c - p) / p) * 1000) / 10;
}

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

const dmcaListQuerySchema = z.object({
  status: z.enum(["pending", "reviewing", "resolved", "rejected", "all"]).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const dmcaIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const dmcaUpdateSchema = z.object({
  status: z.enum(["pending", "reviewing", "resolved", "rejected"]),
  resolution_notes: z.string().trim().max(8000).optional().nullable(),
  remove_infringing_message: z.boolean().optional(),
});

const dpoListQuerySchema = z.object({
  status: z.enum(["pending", "responded", "closed", "all"]).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const dpoIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const dpoUpdateSchema = z.object({
  status: z.enum(["pending", "responded", "closed"]),
  response: z.string().trim().max(8000).optional().nullable(),
});

router.get("/metrics", (_req, res) => {
  res.json(getSnapshot());
});

/**
 * Aggregated KPIs and activity for the admin overview UI (DB-backed; resets only where noted).
 */
router.get("/overview", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*)::bigint FROM users WHERE deleted_at IS NULL) AS users_total,
        (SELECT COUNT(*)::bigint FROM users WHERE deleted_at IS NULL AND created_at >= date_trunc('day', NOW())) AS users_new_today,
        (SELECT COUNT(*)::bigint FROM users WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '24 hours') AS users_new_24h,
        (SELECT COUNT(*)::bigint FROM users WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '48 hours' AND created_at < NOW() - INTERVAL '24 hours') AS users_new_prev_24h,
        (
          SELECT COUNT(*)::int FROM (
            SELECT user_id FROM messages WHERE created_at >= NOW() - INTERVAL '24 hours'
            UNION
            SELECT sender_id AS user_id FROM direct_messages WHERE created_at >= NOW() - INTERVAL '24 hours'
          ) u
        ) AS users_active_24h,
        (SELECT COUNT(*)::bigint FROM messages) AS messages_channel_total,
        (SELECT COUNT(*)::bigint FROM direct_messages) AS messages_dm_total,
        (SELECT COUNT(*)::bigint FROM messages WHERE created_at >= NOW() - INTERVAL '1 hour') AS messages_ch_1h,
        (SELECT COUNT(*)::bigint FROM direct_messages WHERE created_at >= NOW() - INTERVAL '1 hour') AS messages_dm_1h,
        (SELECT COUNT(*)::bigint FROM messages WHERE created_at >= NOW() - INTERVAL '2 hours' AND created_at < NOW() - INTERVAL '1 hour') AS messages_ch_prev_h,
        (SELECT COUNT(*)::bigint FROM direct_messages WHERE created_at >= NOW() - INTERVAL '2 hours' AND created_at < NOW() - INTERVAL '1 hour') AS messages_dm_prev_h,
        (
          SELECT COUNT(*)::int FROM admin_audit_logs a
          WHERE a.action IN ('message_report_user', 'dm_message_report_user')
            AND COALESCE(a.metadata->>'status', 'open') = 'open'
        ) AS pending_message_reports,
        (SELECT COUNT(*)::bigint FROM servers) AS servers_total
    `);
    const r = rows[0] || {};
    const ch1h = Number(r.messages_ch_1h || 0);
    const dm1h = Number(r.messages_dm_1h || 0);
    const chPrev = Number(r.messages_ch_prev_h || 0);
    const dmPrev = Number(r.messages_dm_prev_h || 0);
    const msgCombined1h = ch1h + dm1h;
    const msgCombinedPrev = chPrev + dmPrev;

    res.json({
      ok: true,
      generated_at: new Date().toISOString(),
      kpis: {
        users: {
          total: Number(r.users_total || 0),
          new_today: Number(r.users_new_today || 0),
          new_last_24h: Number(r.users_new_24h || 0),
          delta_pct_24h: pctDelta(r.users_new_24h, r.users_new_prev_24h),
        },
        licenses: { available: false, note: "Not part of AkoeNet" },
        revenue: { available: false, note: "Not part of AkoeNet" },
        messages: {
          total_in_db: Number(r.messages_channel_total || 0) + Number(r.messages_dm_total || 0),
          channel_total: Number(r.messages_channel_total || 0),
          dm_total: Number(r.messages_dm_total || 0),
          last_hour: { channel: ch1h, dm: dm1h, combined: msgCombined1h },
          delta_pct_hour_vs_prior: pctDelta(msgCombined1h, msgCombinedPrev),
        },
        servers_total: Number(r.servers_total || 0),
      },
      activity: {
        messages_last_hour: { channel: ch1h, dm: dm1h },
        users_active_24h: Number(r.users_active_24h || 0),
        users_new_today: Number(r.users_new_today || 0),
      },
      alerts: {
        pending_message_reports: Number(r.pending_message_reports || 0),
      },
    });
  } catch (e) {
    res.status(500).json({ error: "overview_failed", message: e?.message || String(e) });
  }
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
    try {
      const row = updated.rows[0];
      const reporterId = Number(row.actor_user_id);
      const io = req.app?.locals?.io;
      if (io && Number.isInteger(reporterId) && reporterId > 0) {
        io.to(`user:${reporterId}`).emit("in_app_notification", {
          type: "report_status",
          report_id: Number(row.id),
          status,
          server_id: row.server_id ? Number(row.server_id) : null,
          channel_id: row.channel_id ? Number(row.channel_id) : null,
          message_id: row.target_message_id ? Number(row.target_message_id) : null,
          snippet:
            status === "resolved"
              ? "Your report was resolved by moderation."
              : status === "rejected"
                ? "Your report was reviewed and rejected."
                : "Your report was reopened.",
        });
      }
    } catch {
      /* notification is best-effort */
    }
    res.json({ ok: true, item: updated.rows[0] });
  }
);

router.get("/dmca-takedowns", validate({ query: dmcaListQuerySchema }), async (req, res) => {
  const status = req.query.status || "all";
  const limit = req.query.limit ?? 50;
  const offset = req.query.offset ?? 0;
  const params = [];
  const where = [];
  if (status !== "all") {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM dmca_takedowns ${whereSql}`,
    params
  );
  const listParams = [...params, limit, offset];
  const result = await pool.query(
    `SELECT d.*,
            u.username AS resolved_by_username
     FROM dmca_takedowns d
     LEFT JOIN users u ON u.id = d.resolved_by
     ${whereSql}
     ORDER BY d.created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  res.json({
    items: result.rows,
    total: Number(countResult.rows[0]?.total || 0),
    limit,
    offset,
  });
});

router.patch(
  "/dmca-takedowns/:id",
  validate({ params: dmcaIdParamsSchema, body: dmcaUpdateSchema }),
  async (req, res) => {
    const id = req.params.id;
    const { status, resolution_notes, remove_infringing_message } = req.body;

    const cur = await pool.query(`SELECT * FROM dmca_takedowns WHERE id = $1`, [id]);
    if (!cur.rows.length) {
      return res.status(404).json({ error: "not_found" });
    }
    const row = cur.rows[0];

    const updated = await pool.query(
      `UPDATE dmca_takedowns
       SET status = $2,
           resolution_notes = COALESCE($3, resolution_notes),
           resolved_by = CASE WHEN $2 IN ('resolved','rejected') THEN $4 ELSE resolved_by END,
           resolved_at = CASE WHEN $2 IN ('resolved','rejected') THEN COALESCE(resolved_at, NOW()) ELSE resolved_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, resolution_notes ?? null, req.user.id]
    );

    let removal = { attempted: false, channel_messages: 0, direct_messages: 0 };
    if (remove_infringing_message === true && status === "resolved") {
      const mid = extractMessageIdFromUrl(row.infringing_url);
      if (mid) {
        removal.attempted = true;
        try {
          const ch = await pool.query(
            `UPDATE messages
             SET content = $2,
                 image_url = NULL,
                 dmca_removed_at = NOW()
             WHERE id = $1 AND dmca_removed_at IS NULL
             RETURNING id`,
            [mid, "[Content removed following a valid copyright notice.]"]
          );
          removal.channel_messages = Number(ch.rowCount || 0);
          if (!removal.channel_messages) {
            const dm = await pool.query(
              `UPDATE direct_messages
               SET content = $2,
                   image_url = NULL,
                   dmca_removed_at = NOW()
               WHERE id = $1 AND dmca_removed_at IS NULL
               RETURNING id`,
              [mid, "[Content removed following a valid copyright notice.]"]
            );
            removal.direct_messages = Number(dm.rowCount || 0);
          }
        } catch (e) {
          logger.error({ err: e, messageId: mid }, "DMCA message removal failed");
          removal.error = e?.message || "removal_failed";
        }
      }
    }

    res.json({ ok: true, item: updated.rows[0], removal });
  }
);

router.get("/dpo-requests", validate({ query: dpoListQuerySchema }), async (req, res) => {
  const status = req.query.status || "all";
  const limit = req.query.limit ?? 50;
  const offset = req.query.offset ?? 0;
  const params = [];
  const where = [];
  if (status !== "all") {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM dpo_requests ${whereSql}`, params);
  const listParams = [...params, limit, offset];
  const result = await pool.query(
    `SELECT r.*,
            u.username AS responded_by_username
     FROM dpo_requests r
     LEFT JOIN users u ON u.id = r.responded_by
     ${whereSql}
     ORDER BY r.created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  res.json({
    items: result.rows,
    total: Number(countResult.rows[0]?.total || 0),
    limit,
    offset,
  });
});

router.patch(
  "/dpo-requests/:id",
  validate({ params: dpoIdParamsSchema, body: dpoUpdateSchema }),
  async (req, res) => {
    const id = req.params.id;
    const { status, response } = req.body;

    const updated = await pool.query(
      `UPDATE dpo_requests
       SET status = $2,
           response = COALESCE($3, response),
           responded_by = CASE WHEN $2 IN ('responded','closed') THEN $4 ELSE responded_by END,
           responded_at = CASE WHEN $2 IN ('responded','closed') THEN COALESCE(responded_at, NOW()) ELSE responded_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, response ?? null, req.user.id]
    );
    if (!updated.rows.length) {
      return res.status(404).json({ error: "not_found" });
    }
    res.json({ ok: true, item: updated.rows[0] });
  }
);

router.get("/backup-status", async (_req, res) => {
  const backupDir = process.env.BACKUP_DIR || "";
  if (!backupDir || !fs.existsSync(backupDir)) {
    return res.json({
      backup_enabled: false,
      backup_directory: backupDir || null,
      note: "Set BACKUP_DIR to a directory where scheduled dumps are written (see scripts/backup-db.sh).",
      status: "unknown",
    });
  }
  try {
    const names = fs.readdirSync(backupDir);
    const files = names
      .filter((f) => f.endsWith(".sql.gz") || f.endsWith(".dump") || f.endsWith(".sql"))
      .map((name) => {
        const full = path.join(backupDir, name);
        const st = fs.statSync(full);
        return { name, size: st.size, modified: st.mtime };
      })
      .sort((a, b) => b.modified - a.modified);

    const last = files[0];
    const hoursSince = last
      ? (Date.now() - last.modified.getTime()) / (1000 * 60 * 60)
      : null;

    res.json({
      backup_enabled: true,
      backup_directory: backupDir,
      last_backup: last || null,
      hours_since_last_backup: hoursSince,
      backup_count: files.length,
      status: hoursSince != null && hoursSince > 48 ? "warning" : "ok",
      recommended_action:
        hoursSince != null && hoursSince > 48 ? "No recent backup file found in BACKUP_DIR." : null,
    });
  } catch (e) {
    res.json({
      backup_enabled: false,
      error: e?.message || String(e),
      status: "error",
    });
  }
});

router.get("/push/debug", async (_req, res) => {
  try {
    const data = await getPushDeliveryDebug();
    res.json({
      ok: true,
      checked_at: new Date().toISOString(),
      ...data,
    });
  } catch (e) {
    logger.error({ err: e }, "push debug failed");
    res.status(500).json({ ok: false, error: "push_debug_failed" });
  }
});

module.exports = router;
