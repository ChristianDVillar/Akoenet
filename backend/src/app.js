const path = require("path");
const express = require("express");
const cors = require("cors");
const pinoHttp = require("pino-http");
const swaggerUi = require("swagger-ui-express");

const authRoutes = require("./routes/auth.routes");
const serverRoutes = require("./routes/server.routes");
const channelRoutes = require("./routes/channel.routes");
const messageRoutes = require("./routes/message.routes");
const uploadRoutes = require("./routes/upload.routes");
const dmRoutes = require("./routes/dm.routes");
const adminRoutes = require("./routes/admin.routes");
const integrationRoutes = require("./routes/integration.routes");
const logger = require("./lib/logger");
const { errorHandler, notFoundHandler } = require("./middleware/error-handler");
const pool = require("./config/db");
const { getStorageStatus, resolveDownloadUrl } = require("./services/storage");
const auth = require("./middleware/auth");
const requireAdmin = require("./middleware/require-admin");
const { buildOpenApiSpec } = require("./docs/openapi");
const { fetchSchedulerDiscovery } = require("./lib/scheduler-client");

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
  };
  if (report.deps.scheduler.configured) {
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

function createApp() {
  const app = express();
  const uploadDir = path.join(__dirname, "..", "uploads");
  const twitchClientId = process.env.TWITCH_CLIENT_ID || "";

  app.use(cors({ origin: true, credentials: true }));
  app.use(pinoHttp({ logger }));
  app.use(express.json());
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

  app.get("/admin/health/deps", auth, requireAdmin, async (_req, res) => {
    const report = await buildDepsReport(app);
    res.status(report.ok ? 200 : 503).json(report);
  });
  app.use("/admin", auth, requireAdmin, adminRoutes);

  app.use("/auth", authRoutes);
  // Alias for Twitch OAuth URLs already registered as /api/user/auth/... (must match TWITCH_REDIRECT_URI exactly).
  app.use("/api/user/auth", authRoutes);
  app.use("/servers", serverRoutes);
  app.use("/channels", channelRoutes);
  app.use("/messages", messageRoutes);
  app.use("/upload", uploadRoutes);
  app.use("/dm", dmRoutes);
  app.use("/integrations", integrationRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
