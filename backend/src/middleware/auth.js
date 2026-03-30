const jwt = require("jsonwebtoken");
const tokenVersion = parseInt(process.env.TOKEN_VERSION || "2", 10);
const { getJwtSecret } = require("../lib/jwt-secret");
const pool = require("../config/db");

async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (decoded.token_version !== tokenVersion) {
      return res.status(401).json({ error: "Token expired, please login again" });
    }
    const userCheck = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL",
      [decoded.id]
    );
    if (!userCheck.rows.length) {
      return res.status(401).json({ error: "Account no longer active" });
    }
    req.user = { id: decoded.id, email: decoded.email, is_admin: Boolean(decoded.is_admin) };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = auth;
