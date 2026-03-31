/**
 * In production, redirect HTTP to HTTPS when the app is not already seen as TLS
 * (set TRUST_PROXY=1 behind a reverse proxy). Set FORCE_HTTPS=false to disable.
 */
function httpsRedirect(req, res, next) {
  if (process.env.NODE_ENV !== "production") return next();
  if (String(process.env.FORCE_HTTPS || "").toLowerCase() === "false") return next();

  const proto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const secured = req.secure === true || proto === "https";

  if (secured) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    return next();
  }

  const host = req.headers.host || "localhost";
  const path = req.originalUrl || req.url || "/";
  return res.redirect(301, `https://${host}${path}`);
}

module.exports = httpsRedirect;
