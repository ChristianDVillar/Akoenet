const { getChannelServerId } = require("./membership");
const { sanitizeMediaUrl } = require("./sanitize-media-url");

/**
 * Inserta un mensaje de canal y lo emite por Socket.IO (receive_message + echonet_notification).
 * @param {import("socket.io").Server | null | undefined} io
 * @param {import("pg").Pool} pool
 */
async function broadcastChannelMessage(io, pool, { channelId, userId, content }) {
  const insertResult = await pool.query(
    `INSERT INTO messages (channel_id, user_id, content, image_url)
     VALUES ($1, $2, $3, NULL)
     RETURNING *`,
    [channelId, userId, content]
  );
  const u = await pool.query("SELECT username, avatar_url FROM users WHERE id = $1", [userId]);
  const message = {
    ...insertResult.rows[0],
    username: u.rows[0]?.username,
    avatar_url: u.rows[0]?.avatar_url ? sanitizeMediaUrl(u.rows[0].avatar_url) : null,
    reactions: [],
  };
  const serverId = await getChannelServerId(channelId);
  if (io && serverId) {
    io.to(`channel:${channelId}`).emit("receive_message", message);
    io.to(`server:${serverId}`).emit("echonet_notification", {
      serverId,
      channelId,
      username: message.username,
      snippet: String(content || "").trim().slice(0, 80),
      messageId: message.id,
    });
  }
  return message;
}

module.exports = { broadcastChannelMessage };
