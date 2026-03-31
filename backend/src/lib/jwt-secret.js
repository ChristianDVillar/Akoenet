function getJwtSecret() {
  const raw = process.env.JWT_SECRET;
  const trimmed = raw != null ? String(raw).trim() : "";
  const secret = trimmed !== "" ? trimmed : "dev-secret-change-me";
  const isProd = process.env.NODE_ENV === "production";
  const usingDefault = secret === "dev-secret-change-me";
  const weak = secret.length < 32;
  if (isProd && (usingDefault || weak)) {
    const defined = Object.prototype.hasOwnProperty.call(process.env, "JWT_SECRET");
    let detail;
    if (!defined || trimmed.length === 0) {
      detail =
        "JWT_SECRET is missing or empty in the process environment (e.g. Render → Environment for this Web Service). A local backend/.env is not copied into the Docker image.";
    } else if (usingDefault) {
      detail =
        "JWT_SECRET matches the development default; set a different value in the service environment.";
    } else {
      detail = `JWT_SECRET is ${secret.length} characters after trim; production requires at least 32.`;
    }
    throw new Error(`JWT_SECRET is insecure for production. ${detail}`);
  }
  return secret;
}

module.exports = { getJwtSecret };
