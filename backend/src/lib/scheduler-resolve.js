/**
 * Maps a Twitch login (or requested handle) to the Streamer Scheduler public API username (slug).
 * When a user links Twitch and sets `scheduler_streamer_username`, requests that use their
 * `twitch_username` are forwarded to the Scheduler with that slug.
 * If there is no mapping, returns `requestedUsername` unchanged so direct slugs (e.g. "Test") still work.
 *
 * @param {import("pg").Pool} pool
 * @param {string} requestedUsername
 * @returns {Promise<string>}
 */
async function resolveSchedulerStreamerSlug(pool, requestedUsername) {
  const q = String(requestedUsername || "").trim();
  if (!q) return "";
  const r = await pool.query(
    `SELECT scheduler_streamer_username FROM users
     WHERE twitch_username IS NOT NULL
       AND LOWER(twitch_username) = LOWER($1)
       AND LENGTH(TRIM(COALESCE(scheduler_streamer_username, ''))) > 0`,
    [q]
  );
  if (r.rows.length) {
    return String(r.rows[0].scheduler_streamer_username).trim();
  }
  return q;
}

module.exports = { resolveSchedulerStreamerSlug };
