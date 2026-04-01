let prom;
let register;
let enabled = false;

function initPrometheusIfEnabled() {
  if (process.env.PROMETHEUS_METRICS_ENABLED !== "1") return;
  try {
    // eslint-disable-next-line global-require
    prom = require("prom-client");
    register = prom.register;
    prom.collectDefaultMetrics({ register, prefix: "akonet_" });
    enabled = true;
  } catch (e) {
    enabled = false;
  }
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
  isPrometheusEnabled: () => enabled,
};
