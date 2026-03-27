const rateLimit = require("express-rate-limit");

const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.UPLOAD_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many upload requests. Try again later.",
  },
});

const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many auth attempts. Try again later.",
  },
});

const reactionRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.REACTION_RATE_LIMIT_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many reaction requests. Try again later.",
  },
});

module.exports = {
  uploadRateLimiter,
  authRateLimiter,
  reactionRateLimiter,
};
