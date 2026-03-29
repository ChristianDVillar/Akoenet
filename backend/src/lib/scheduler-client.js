const logger = require("./logger");

function eventTitle(e) {
  return String(e?.title || e?.name || e?.summary || "Stream").trim();
}

function eventStartRaw(e) {
  return (
    e?.starts_at ||
    e?.start_at ||
    e?.startTime ||
    e?.scheduled_at ||
    e?.scheduledFor ||
    e?.start ||
    null
  );
}

function eventUrl(e) {
  const u = e?.url || e?.link || e?.href;
  return u ? String(u).trim() : "";
}

function normalizeEvents(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.events)) return json.events;
  if (Array.isArray(json.upcoming)) return json.upcoming;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.items)) return json.items;
  if (json.data && typeof json.data === "object" && !Array.isArray(json.data)) return [json.data];
  return [];
}

function buildUpcomingUrl(username) {
  const base = String(process.env.SCHEDULER_API_BASE_URL || "").trim().replace(/\/$/, "");
  /** Streamer Scheduler public API: GET /api/streamer/:username/events (also :username/upcoming, /api/public/.../upcoming) */
  const pathTpl =
    String(process.env.SCHEDULER_UPCOMING_PATH || "/api/streamer/{username}/events").trim() ||
    "/api/streamer/{username}/events";
  const fullTpl = String(process.env.SCHEDULER_UPCOMING_URL_TEMPLATE || "").trim();
  if (fullTpl) {
    return fullTpl.replace(/\{username\}/g, encodeURIComponent(username));
  }
  if (!base) return null;
  const path = pathTpl.startsWith("/") ? pathTpl : `/${pathTpl}`;
  return `${base}${path.replace(/\{username\}/g, encodeURIComponent(username))}`;
}

/**
 * Fetches upcoming events from the public Scheduler API.
 * @param {string} username
 * @returns {Promise<{ ok: boolean, events?: unknown[], error?: string }>}
 */
async function fetchUpcomingEvents(username) {
  const url = buildUpcomingUrl(username);
  if (!url) {
    return { ok: false, error: "scheduler_api_not_configured" };
  }

  const headers = { Accept: "application/json" };
  const token = String(process.env.SCHEDULER_API_TOKEN || "").trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const extraHeader = String(process.env.SCHEDULER_API_EXTRA_HEADER || "").trim();
  const extraValue = String(process.env.SCHEDULER_API_EXTRA_VALUE || "").trim();
  if (extraHeader && extraValue) {
    headers[extraHeader] = extraValue;
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, url }, "Scheduler API non-OK response");
      return { ok: false, error: "scheduler_api_http_error", status: res.status };
    }
    const raw = await res.text();
    let json;
    try {
      json = JSON.parse(raw);
    } catch (parseErr) {
      const contentType = res.headers.get("content-type") || "";
      logger.warn(
        { url, contentType, bodyStart: String(raw).slice(0, 120) },
        "Scheduler API returned non-JSON (wrong base URL or SPA catch-all)"
      );
      return {
        ok: false,
        error: "scheduler_api_invalid_response",
        contentType,
      };
    }
    let events = normalizeEvents(json);
    events = events.map((e) => (e && typeof e === "object" ? e : {}));
    events.sort((a, b) => {
      const ta = new Date(eventStartRaw(a) || 0).getTime();
      const tb = new Date(eventStartRaw(b) || 0).getTime();
      return ta - tb;
    });
    const now = Date.now();
    events = events.filter((e) => {
      const t = new Date(eventStartRaw(e) || 0).getTime();
      if (Number.isNaN(t)) return true;
      return t >= now - 60 * 1000;
    });
    return { ok: true, events };
  } catch (err) {
    logger.warn({ err, url }, "Scheduler API fetch failed");
    return { ok: false, error: "scheduler_api_fetch_failed" };
  }
}

function formatScheduleReply(events, mode) {
  const list = Array.isArray(events) ? events : [];
  if (!list.length) {
    return "📅 No upcoming streams scheduled.";
  }
  if (mode === "next") {
    const e = list[0];
    const start = eventStartRaw(e);
    const when = start
      ? new Date(start).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })
      : "";
    const link = eventUrl(e);
    const lines = [`📅 Next stream: **${eventTitle(e)}**`];
    if (when) lines.push(`🕐 ${when}`);
    if (link) lines.push(`🔗 ${link}`);
    return lines.join("\n");
  }
  const max = Math.min(10, Number(process.env.SCHEDULER_LIST_MAX || 5));
  const chunk = list.slice(0, max);
  const lines = ["📅 Upcoming streams:"];
  chunk.forEach((e, i) => {
    const start = eventStartRaw(e);
    const when = start
      ? new Date(start).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })
      : "?";
    lines.push(`${i + 1}. ${eventTitle(e)} — ${when}`);
  });
  if (list.length > max) {
    lines.push(`… and ${list.length - max} more.`);
  }
  return lines.join("\n");
}

/**
 * @param {string} text
 * @returns {{ mode: 'next' | 'all', username: string | null } | null}
 */
function parseSchedulerChatCommand(text) {
  const t = String(text || "").trim();
  const m = t.match(/^!(next|schedule)(\s+([^\s].*))?$/i);
  if (!m) return null;
  const mode = m[1].toLowerCase() === "next" ? "next" : "all";
  const rest = m[3] != null ? String(m[3]).trim() : "";
  const username = rest.length ? rest : null;
  return { mode, username };
}

/**
 * If /api/integration/akoenet is missing (404), probe /api/health/live — older Scheduler deploys
 * still work for GET /api/streamer/.../events; only the discovery route is new (≥2.3).
 */
async function trySchedulerLegacyReachable(base, startedAt) {
  const liveUrl = `${base}/api/health/live`;
  try {
    const r = await fetch(liveUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    const latency_ms = Date.now() - startedAt;
    if (!r.ok) return null;
    await r.json().catch(() => ({}));
    return {
      ok: true,
      latency_ms,
      discovery: {
        service: "streamer-scheduler",
        version: "unknown",
        discovery_status: "not_deployed",
        hint:
          "Scheduler responds but /api/integration/akoenet is missing (deploy API ≥2.3). Calendar proxy still works if /api/streamer/{username}/events exists.",
      },
    };
  } catch (e) {
    logger.warn({ e, liveUrl }, "Scheduler legacy probe failed");
    return null;
  }
}

/**
 * GET {SCHEDULER_API_BASE_URL}/api/integration/akoenet — public discovery (Streamer Scheduler ≥2.3).
 * @returns {Promise<{ ok: true, latency_ms: number, discovery: object } | { ok: false, error: string, latency_ms?: number, status?: number }>}
 */
async function fetchSchedulerDiscovery() {
  const base = String(process.env.SCHEDULER_API_BASE_URL || "").trim().replace(/\/$/, "");
  if (!base) {
    return { ok: false, error: "not_configured" };
  }
  const url = `${base}/api/integration/akoenet`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    const latency_ms = Date.now() - started;
    if (res.status === 404) {
      const legacy = await trySchedulerLegacyReachable(base, started);
      if (legacy) {
        logger.info({ base }, "Scheduler discovery 404 — using legacy reachability probe");
        return legacy;
      }
    }
    if (!res.ok) {
      logger.warn({ status: res.status, url }, "Scheduler discovery non-OK");
      return { ok: false, error: "scheduler_discovery_http", status: res.status, latency_ms };
    }
    const raw = await res.text();
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      return { ok: false, error: "scheduler_discovery_invalid_json", latency_ms };
    }
    return { ok: true, latency_ms, discovery: json };
  } catch (err) {
    logger.warn({ err, url }, "Scheduler discovery fetch failed");
    return { ok: false, error: "scheduler_discovery_fetch_failed", latency_ms: Date.now() - started };
  }
}

module.exports = {
  fetchUpcomingEvents,
  fetchSchedulerDiscovery,
  formatScheduleReply,
  parseSchedulerChatCommand,
  eventTitle,
  eventStartRaw,
  buildUpcomingUrl,
};
