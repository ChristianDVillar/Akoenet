const rateLimit = require("express-rate-limit");

const defaultGlobalMax =
  process.env.GLOBAL_RATE_LIMIT_MAX != null && String(process.env.GLOBAL_RATE_LIMIT_MAX).trim() !== ""
    ? Number(process.env.GLOBAL_RATE_LIMIT_MAX)
    : process.env.NODE_ENV === "production"
      ? 200
      : 400;

/** Broad per-IP cap on all API traffic (feature-specific limits still apply). */
const globalIpRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number.isFinite(defaultGlobalMax) && defaultGlobalMax > 0 ? defaultGlobalMax : 400,
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

/** Open Graph / link preview (server-side fetch; abuse-sensitive). */
const linkPreviewRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.LINK_PREVIEW_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many link preview requests. Try again later.",
  },
});

/** DM user picker — listar usuarios para abrir conversación (anti enumeración). */
const dmUserSearchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.DM_USER_SEARCH_RATE_LIMIT_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many DM user search requests. Try again later.",
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
  linkPreviewRateLimiter,
  dmUserSearchRateLimiter,
};
