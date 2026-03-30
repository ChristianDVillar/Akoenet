const pino = require("pino");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.body.password",
      "req.body.current_password",
      "req.body.new_password",
      "req.body.token",
      "req.body.access_token",
    ],
    remove: true,
  },
});

module.exports = logger;
