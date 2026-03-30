function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "dev-secret-change-me");
  const isProd = process.env.NODE_ENV === "production";
  const usingDefault = secret === "dev-secret-change-me";
  const weak = secret.length < 32;
  if (isProd && (usingDefault || weak)) {
    throw new Error(
      "JWT_SECRET is insecure for production. Use a non-default secret with at least 32 characters."
    );
  }
  return secret;
}

module.exports = { getJwtSecret };
