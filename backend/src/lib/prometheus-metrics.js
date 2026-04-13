let prom;
let register;
let enabled = false;
let httpRequestDuration;

function initPrometheusIfEnabled() {
  if (process.env.PROMETHEUS_METRICS_ENABLED !== "1") return;
  try {
    prom = require("prom-client");
    register = prom.register;
    prom.collectDefaultMetrics({ register, prefix: "akonet_" });
    httpRequestDuration = new prom.Histogram({
      name: "akonet_http_request_duration_seconds",
      help: "HTTP request duration in seconds",
      labelNames: ["method", "status_code"],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15],
    });
    enabled = true;
  } catch (e) {
    enabled = false;
  }
}

function httpMetricsMiddleware(req, res, next) {
  if (!enabled || !httpRequestDuration) return next();
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    try {
      const sec = Number(process.hrtime.bigint() - start) / 1e9;
      httpRequestDuration.observe(
        { method: req.method || "UNKNOWN", status_code: String(res.statusCode || 0) },
        sec
      );
    } catch (_) {
      /* ignore */
    }
  });
  next();
}

function metricsHandler(req, res) {
  if (!enabled || !register) {
    res.status(404).end();
    return;
  }
  res.set("Content-Type", register.contentType);
  register
    .metrics()
    .then((out) => res.end(out))
    .catch(() => res.status(500).end());
}

module.exports = {
  initPrometheusIfEnabled,
  metricsHandler,
  httpMetricsMiddleware,
  isPrometheusEnabled: () => enabled,
};
