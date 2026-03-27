const pool = require("../config/db");

async function requireAdmin(req, res, next) {
  try {
    if (req.user?.is_admin === true) return next();
    const result = await pool.query("SELECT is_admin FROM users WHERE id = $1", [req.user?.id]);
    if (!result.rows.length || !result.rows[0].is_admin) {
      return res.status(403).json({ error: "Admin only" });
    }
    req.user.is_admin = true;
    next();
  } catch {
    return res.status(500).json({ error: "Admin check failed" });
  }
}

module.exports = requireAdmin;
