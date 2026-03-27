const logger = require("../lib/logger");

function notFoundHandler(_req, res) {
  res.status(404).json({ error: "Not found" });
}

function errorHandler(err, req, res, _next) {
  logger.error(
    {
      err: {
        message: err?.message,
        stack: err?.stack,
        code: err?.code,
      },
      method: req.method,
      path: req.originalUrl,
      userId: req.user?.id || null,
    },
    "Unhandled error"
  );
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
}

module.exports = { notFoundHandler, errorHandler };
