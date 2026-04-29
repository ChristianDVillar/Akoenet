const path = require("path");
const express = require("express");
const cors = require("cors");
const pinoHttp = require("pino-http");
const swaggerUi = require("swagger-ui-express");
const helmet = require("helmet");

const authRoutes = require("./routes/auth.routes");
const serverRoutes = require("./routes/server.routes");
const channelRoutes = require("./routes/channel.routes");
const messageRoutes = require("./routes/message.routes");
const uploadRoutes = require("./routes/upload.routes");
const dmRoutes = require("./routes/dm.routes");
const adminRoutes = require("./routes/admin.routes");
const integrationRoutes = require("./routes/integration.routes");
const dmcaRoutes = require("./routes/dmca.routes");
const dpoRoutes = require("./routes/dpo.routes");
const httpsRedirect = require("./middleware/https-redirect");
const logger = require("./lib/logger");
const { globalIpRateLimiter } = require("./middleware/rate-limit");
const { errorHandler, notFoundHandler } = require("./middleware/error-handler");
const pool = require("./config/db");
const { getStorageStatus, resolveDownloadUrl } = require("./services/storage");
const auth = require("./middleware/auth");
const requireTermsAccepted = require("./middleware/require-terms");
const requireAdmin = require("./middleware/require-admin");
const { buildOpenApiSpec } = require("./docs/openapi");
const { fetchSchedulerDiscovery } = require("./lib/scheduler-client");
const { initPrometheusIfEnabled, metricsHandler, httpMetricsMiddleware } = require("./lib/prometheus-metrics");
const linkPreviewRoutes = require("./routes/link-preview.routes");
const socialRoutes = require("./routes/social.routes");

initPrometheusIfEnabled();

async function buildDepsReport(app) {
  const startedAt = Date.now();
  const appVersion = process.env.APP_VERSION || process.env.npm_package_version || "unknown";
  const report = {
    ok: true,
    version: appVersion,
    uptime_ms: Math.round(process.uptime() * 1000),
    checked_at: new Date().toISOString(),
    total_latency_ms: 0,
    deps: {
      api: { ok: true, latency_ms: 0 },
      db: { ok: false, latency_ms: null },
      redis: { ok: false, enabled: Boolean(app.locals.redisEnabled), latency_ms: null },
      storage: { ok: false, driver: process.env.STORAGE_DRIVER || "local", latency_ms: null },
    },
  };

  try {
    const dbStart = Date.now();
    await pool.query("SELECT 1");
    report.deps.db = { ok: true, latency_ms: Date.now() - dbStart };
  } catch (e) {
    report.ok = false;
    report.deps.db = { ok: false, latency_ms: null, error: e?.message || "db_error" };
  }

  try {
    const redisClient = app.locals.redisClient || null;
    if (redisClient && app.locals.redisEnabled) {
      const redisStart = Date.now();
      const pong = await redisClient.ping();
      report.deps.redis = { ok: pong === "PONG", enabled: true, latency_ms: Date.now() - redisStart };
      if (pong !== "PONG") report.ok = false;
    } else {
      report.deps.redis = {
        ok: false,
        enabled: false,
        latency_ms: null,
        error: "redis_not_configured",
      };
    }
  } catch (e) {
    report.ok = false;
    report.deps.redis = {
      ok: false,
      enabled: true,
      latency_ms: null,
      error: e?.message || "redis_error",
    };
  }

  const storageStart = Date.now();
  const storage = await getStorageStatus();
  report.deps.storage = {
    ...storage,
    latency_ms: Date.now() - storageStart,
  };
  if (!report.deps.storage.ok) report.ok = false;

  report.deps.scheduler = {
    configured: Boolean(String(process.env.SCHEDULER_API_BASE_URL || "").trim()),
    ok: true,
    latency_ms: null,
    service: null,
    version: null,
    error: null,
    base_url: null,
    admin_url: null,
  };
  if (report.deps.scheduler.configured) {
    const schedulerBase = String(process.env.SCHEDULER_API_BASE_URL || "").trim().replace(/\/$/, "");
    report.deps.scheduler.base_url = schedulerBase;
    report.deps.scheduler.admin_url =
      String(process.env.SCHEDULER_ADMIN_URL || "").trim() || `${schedulerBase}/admin`;
    const sch = await fetchSchedulerDiscovery();
    report.deps.scheduler.latency_ms = sch.latency_ms ?? null;
    if (sch.ok && sch.discovery) {
      report.deps.scheduler.service = sch.discovery.service || null;
      report.deps.scheduler.version = sch.discovery.version || null;
      if (sch.discovery.discovery_status === "not_deployed") {
        report.deps.scheduler.legacy = true;
        report.deps.scheduler.hint = sch.discovery.hint || null;
      }
    } else {
      report.deps.scheduler.ok = false;
      report.deps.scheduler.error = sch.error || "unknown";
      if (sch.status != null) report.deps.scheduler.httpStatus = sch.status;
    }
  } else {
    report.deps.scheduler.error = "not_configured";
  }

  report.total_latency_ms = Date.now() - startedAt;
  return report;
}

/** Tauri desktop webview (fetch / CORS) — not the same origin as the public SPA. */
function isTauriWebviewOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;
  try {
    const h = new URL(origin).hostname.toLowerCase();
    return h === "tauri.localhost" || h.endsWith(".tauri.localhost");
  } catch {
    return false;
  }
}

function normalizeCorsOrigins(origins) {
  if (process.env.NODE_ENV !== "production") return origins;
  return origins.map((o) => {
    const u = String(o).trim();
    if (!u) return u;
    if (/localhost|127\.0\.0\.1|\[::1\]/i.test(u)) return u;
    if (u.startsWith("http://")) return `https://${u.slice("http://".length)}`;
    return u;
  });
}

function createApp() {
  const app = express();
  const uploadDir = path.join(__dirname, "..", "uploads");
  const twitchClientId = process.env.TWITCH_CLIENT_ID || "";

  if (process.env.TRUST_PROXY === "1" || String(process.env.TRUST_PROXY || "").toLowerCase() === "true") {
    app.set("trust proxy", 1);
  }

  app.disable("x-powered-by");
  app.use(httpsRedirect);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  const corsOrigins = normalizeCorsOrigins(
    String(process.env.CORS_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const isProduction = process.env.NODE_ENV === "production";
  const allowAllOrigins = corsOrigins.length === 0 && !isProduction;
  const allowCredentials = String(process.env.CORS_CREDENTIALS || "true").toLowerCase() !== "false";
  if (isProduction && corsOrigins.length === 0) {
    logger.warn("CORS_ORIGINS is empty in production; rejecting browser origins except Tauri webview.");
  }
  app.use(
    cors({
      origin(origin, cb) {
        if (allowAllOrigins || !origin) return cb(null, true);
        if (corsOrigins.includes(origin)) return cb(null, true);
        if (isTauriWebviewOrigin(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: allowCredentials,
    })
  );
  app.use(pinoHttp({ logger }));
  app.get("/metrics", (req, res, next) => {
    const token = String(process.env.METRICS_AUTH_TOKEN || "").trim();
    if (!token) return metricsHandler(req, res, next);
    const auth = String(req.headers.authorization || "");
    if (auth === `Bearer ${token}`) return metricsHandler(req, res, next);
    return res.status(401).json({ error: "Unauthorized" });
  });
  app.use(globalIpRateLimiter);
  app.use(express.json());
  app.use(httpMetricsMiddleware);
  app.use("/dmca", dmcaRoutes);
  app.use("/dpo", dpoRoutes);
  app.get("/uploads/:key", async (req, res, next) => {
    if ((process.env.STORAGE_DRIVER || "local").toLowerCase() !== "s3") {
      return next();
    }
    try {
      const url = await resolveDownloadUrl(req.params.key);
      return res.redirect(302, url);
    } catch (error) {
      logger.warn({ err: error }, "Failed to resolve upload URL");
      return res.status(404).json({ error: "File not found" });
    }
  });
  app.use("/uploads", express.static(uploadDir));

  app.get("/", (_req, res) =>
    res.json({
      ok: true,
      product: "AkoeNet",
      message: "Backend running",
      health: "/health",
      docs: "/docs",
    })
  );
  app.get("/health", (_req, res) =>
    res.json({ ok: true, product: "AkoeNet", chat: "AkoeNet", twitchClientId })
  );
  app.get("/docs/openapi.json", (_req, res) => {
    res.json(buildOpenApiSpec());
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(buildOpenApiSpec(), { explorer: true }));

  app.get("/health/deps", async (_req, res) => {
    const report = await buildDepsReport(app);
    res.status(report.ok ? 200 : 503).json(report);
  });

  app.get("/admin/health/deps", auth, requireTermsAccepted, requireAdmin, async (_req, res) => {
    const report = await buildDepsReport(app);
    res.status(report.ok ? 200 : 503).json(report);
  });
  app.use("/admin", auth, requireTermsAccepted, requireAdmin, adminRoutes);

  app.use("/auth", authRoutes);
  // Alias for Twitch OAuth URLs already registered as /api/user/auth/... (must match TWITCH_REDIRECT_URI exactly).
  app.use("/api/user/auth", authRoutes);
  app.use("/servers", serverRoutes);
  app.use("/channels", channelRoutes);
  app.use("/messages", messageRoutes);
  app.use("/upload", uploadRoutes);
  app.use("/dm", dmRoutes);
  app.use("/integrations", integrationRoutes);
  app.use("/link-preview", linkPreviewRoutes);
  app.use("/social", socialRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
