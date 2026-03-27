const jwt = require("jsonwebtoken");
const tokenVersion = parseInt(process.env.TOKEN_VERSION || "2", 10);

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev-secret-change-me");
    if (decoded.token_version !== tokenVersion) {
      return res.status(401).json({ error: "Token expired, please login again" });
    }
    req.user = { id: decoded.id, email: decoded.email, is_admin: Boolean(decoded.is_admin) };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = auth;
