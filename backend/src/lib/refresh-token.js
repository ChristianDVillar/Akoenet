const crypto = require("crypto");

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

/** Returns { raw, hash } — store only hash in DB. */
function generateRefreshTokenPair() {
  const raw = crypto.randomBytes(48).toString("base64url");
  return { raw, hash: sha256Hex(raw) };
}

function refreshExpiresDays() {
  const n = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || "30", 10);
  return Number.isFinite(n) && n > 0 && n <= 365 ? n : 30;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} userId
 * @returns {Promise<string>} raw refresh token for client
 */
async function createStoredRefreshToken(pool, userId) {
  const { raw, hash } = generateRefreshTokenPair();
  const days = refreshExpiresDays();
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 day'))`,
    [userId, hash, days]
  );
  return raw;
}

module.exports = {
  sha256Hex,
  generateRefreshTokenPair,
  createStoredRefreshToken,
};
