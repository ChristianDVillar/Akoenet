const logger = require("./logger");
const { broadcastChannelMessage } = require("./channel-message-broadcast");

/**
 * Prefer #general, else first text channel by position.
 */
async function resolveWelcomeTextChannelId(db, serverId) {
  const { rows } = await db.query(
    `SELECT c.id
     FROM channels c
     WHERE c.server_id = $1 AND c.type = 'text'
     ORDER BY
       CASE WHEN LOWER(TRIM(c.name)) = 'general' THEN 0 ELSE 1 END,
       c.position ASC NULLS LAST,
       c.id ASC
     LIMIT 1`,
    [serverId]
  );
  return rows[0]?.id ?? null;
}

/**
 * Posts a short greeting as the joining user in the server's main text channel.
 * Fire after membership insert succeeds (and transaction committed for invite flow).
 */
async function postJoinWelcomeMessage({ pool, io, serverId, userId }) {
  const uid = Number(userId);
  const sid = Number(serverId);
  if (!Number.isFinite(uid) || !Number.isFinite(sid)) return null;

  try {
    const u = await pool.query("SELECT username FROM users WHERE id = $1 AND deleted_at IS NULL", [uid]);
    const username = String(u.rows[0]?.username || "there").trim() || "there";

    const channelId = await resolveWelcomeTextChannelId(pool, sid);
    if (!channelId) {
      logger.debug({ serverId: sid }, "No text channel for join welcome");
      return null;
    }

    const content = `Hello, ${username}!`;
    return await broadcastChannelMessage(io, pool, { channelId, userId: uid, content });
  } catch (e) {
    logger.warn({ err: e, serverId, userId }, "Join welcome message failed");
    return null;
  }
}

module.exports = { postJoinWelcomeMessage };
