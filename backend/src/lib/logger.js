const pino = require("pino");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.x-api-key",
      "req.body.password",
      "req.body.current_password",
      "req.body.new_password",
      "req.body.token",
      "req.body.access_token",
      "req.body.refresh_token",
      "req.body.client_secret",
      "req.body.api_key",
      "req.query.token",
      "req.query.access_token",
      "req.query.refresh_token",
    ],
    remove: true,
  },
});

module.exports = logger;
