const pool = require("../config/db");
const { getCurrentTermsVersion, userNeedsTermsAcceptance } = require("../lib/legal-terms");

/**
 * After `auth`. Blocks API use until the user has accepted the current LEGAL_TERMS_VERSION.
 * Exempt routes must not use this middleware (e.g. GET /auth/me, POST /auth/terms/accept).
 */
async function requireTermsAccepted(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const r = await pool.query(
      `SELECT terms_version, terms_accepted_at FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.id]
    );
    if (!r.rows.length) {
      return res.status(401).json({ error: "Account no longer active" });
    }
    const row = r.rows[0];
    if (userNeedsTermsAcceptance(row)) {
      return res.status(403).json({
        error: "terms_acceptance_required",
        current_terms_version: getCurrentTermsVersion(),
      });
    }
    return next();
  } catch (e) {
    return next(e);
  }
}

module.exports = requireTermsAccepted;
