const express = require("express");
const { z } = require("zod");
const pool = require("../config/db");
const validate = require("../middleware/validate");
const auth = require("../middleware/auth");
const requireTermsAccepted = require("../middleware/require-terms");
const { broadcastChannelMessage } = require("../lib/channel-message-broadcast");
const {
  fetchUpcomingEvents,
  fetchSchedulerDiscovery,
  formatScheduleReply,
} = require("../lib/scheduler-client");
const { resolveSchedulerStreamerSlug } = require("../lib/scheduler-resolve");

const router = express.Router();

const upcomingQuerySchema = z.object({
  username: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().trim().min(1).max(80).optional()
  ),
  mode: z.enum(["next", "all"]).optional().default("all"),
});

const streamScheduledSchema = z.object({
  streamer: z.string().trim().min(1).max(80),
  /** Public slug (same as streamer); sent by Streamer Scheduler for explicit mapping. */
  scheduler_slug: z.string().trim().min(1).max(80).optional(),
  twitch_login: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(180),
  starts_at: z.string().datetime(),
  url: z.string().trim().url().max(500),
  platform: z.string().trim().min(2).max(32).default("twitch"),
  channel_id: z.coerce.number().int().positive().optional(),
});

function hasValidSchedulerSecret(req) {
  const expected = String(process.env.SCHEDULER_WEBHOOK_SECRET || "").trim();
  if (!expected) return false;
  const received = String(req.get("x-scheduler-webhook-secret") || "").trim();
  return received && received === expected;
}

function buildAnnouncementMessage(payload) {
  const startDate = new Date(payload.starts_at);
  const startsAt = Number.isNaN(startDate.getTime())
    ? payload.starts_at
    : startDate.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
  const platform = String(payload.platform || "twitch").toUpperCase();
  const slug =
    (payload.scheduler_slug && String(payload.scheduler_slug).trim()) ||
    String(payload.streamer || "").trim();
  const lines = [
    `📅 Stream scheduled`,
    `Streamer: ${slug}`,
    `Title: ${payload.title}`,
    `Platform: ${platform}`,
    `Starts: ${startsAt}`,
    `Link: ${payload.url}`,
  ];
  if (payload.twitch_login && String(payload.twitch_login).trim()) {
    lines.splice(2, 0, `Twitch: ${String(payload.twitch_login).trim()}`);
  }
  return lines.join("\n");
}

router.post(
  "/scheduler/webhooks/stream-scheduled",
  validate({ body: streamScheduledSchema }),
  async (req, res) => {
    if (!hasValidSchedulerSecret(req)) {
      return res.status(401).json({ error: "Invalid scheduler webhook secret" });
    }

    const fallbackChannelId = Number(process.env.SCHEDULER_ANNOUNCE_CHANNEL_ID || 0);
    const announcerUserId = Number(process.env.SCHEDULER_ANNOUNCER_USER_ID || 0);
    const channelId = req.body.channel_id || fallbackChannelId;
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ error: "Missing target channel_id" });
    }
    if (!Number.isInteger(announcerUserId) || announcerUserId <= 0) {
      return res.status(500).json({ error: "SCHEDULER_ANNOUNCER_USER_ID is not configured" });
    }

    const channelResult = await pool.query(
      "SELECT id, server_id FROM channels WHERE id = $1",
      [channelId]
    );
    if (!channelResult.rows.length) {
      return res.status(404).json({ error: "Target channel not found" });
    }

    const userResult = await pool.query("SELECT id, username FROM users WHERE id = $1", [
      announcerUserId,
    ]);
    if (!userResult.rows.length) {
      return res.status(400).json({ error: "Announcer user does not exist" });
    }

    const content = buildAnnouncementMessage(req.body);
    const io = req.app.locals.io;
    const message = await broadcastChannelMessage(io, pool, {
      channelId,
      userId: announcerUserId,
      content,
    });

    return res.status(201).json({
      ok: true,
      message_id: message.id,
      channel_id: channelId,
      server_id: channelResult.rows[0].server_id,
    });
  }
);

/**
 * GET /integrations/scheduler/discovery — proxy público al discovery del Scheduler (sin JWT).
 * Útil para comprobar SCHEDULER_API_BASE_URL y versión del API remoto.
 */
router.get("/scheduler/discovery", async (_req, res) => {
  const d = await fetchSchedulerDiscovery();
  if (d.error === "not_configured") {
    return res.status(503).json({ error: "scheduler_api_not_configured" });
  }
  if (!d.ok) {
    return res.status(502).json({
      error: d.error,
      httpStatus: d.status,
    });
  }
  return res.json(d.discovery);
});

router.get(
  "/scheduler/upcoming",
  auth,
  requireTermsAccepted,
  validate({ query: upcomingQuerySchema }),
  async (req, res) => {
    let username = String(req.query.username || "").trim();
    if (!username) {
      const userRow = await pool.query("SELECT twitch_username FROM users WHERE id = $1", [
        req.user.id,
      ]);
      username = String(userRow.rows[0]?.twitch_username || "").trim();
    }
    if (!username) {
      username = String(process.env.SCHEDULER_DEFAULT_STREAMER_USERNAME || "").trim();
    }
    if (!username) {
      return res.status(400).json({
        error: "No streamer username for schedule",
        code: "MISSING_STREAMER_USERNAME",
      });
    }
    const requestedUsername = username;
    const schedulerSlug = await resolveSchedulerStreamerSlug(pool, requestedUsername);
    const mode = req.query.mode === "next" ? "next" : "all";
    const fetched = await fetchUpcomingEvents(schedulerSlug);
    if (!fetched.ok && fetched.error === "scheduler_api_not_configured") {
      return res.json({
        ok: true,
        scheduler_configured: false,
        username: requestedUsername,
        scheduler_slug: schedulerSlug,
        mode,
        events: [],
        formatted: "",
      });
    }
    if (!fetched.ok) {
      return res.status(502).json({
        error: fetched.error,
        httpStatus: fetched.status,
        contentType: fetched.contentType,
      });
    }
    const formatted = formatScheduleReply(fetched.events, mode);
    return res.json({
      ok: true,
      scheduler_configured: true,
      username: requestedUsername,
      scheduler_slug: schedulerSlug,
      mode,
      events: fetched.events,
      formatted,
    });
  }
);

module.exports = router;
