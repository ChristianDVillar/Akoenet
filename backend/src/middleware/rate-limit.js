const rateLimit = require("express-rate-limit");

/** Broad per-IP cap on all API traffic (feature-specific limits still apply). */
const globalIpRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.GLOBAL_RATE_LIMIT_MAX || 400),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests from this IP. Try again later.",
  },
  skip: (req) => {
    const p = req.path || "";
    if (p === "/health" || p === "/health/deps") return true;
    if (p.startsWith("/docs")) return true;
    return false;
  },
});

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

const userDataRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.USER_DATA_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many profile update requests. Try again later.",
  },
});

const reportRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.REPORT_RATE_LIMIT_MAX || 15),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many report requests. Try again later.",
  },
});

/** Public legal forms (DMCA, DPO) — stricter than generic API. */
const legalFormsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.LEGAL_FORMS_RATE_LIMIT_MAX || 8),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many legal form submissions from this IP. Try again later.",
  },
});

module.exports = {
  globalIpRateLimiter,
  uploadRateLimiter,
  authRateLimiter,
  reactionRateLimiter,
  userDataRateLimiter,
  reportRateLimiter,
  legalFormsRateLimiter,
};
