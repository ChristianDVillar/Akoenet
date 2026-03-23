const pool = require("../config/db");

async function isServerMember(userId, serverId) {
  const r = await pool.query(
    "SELECT 1 FROM server_members WHERE user_id = $1 AND server_id = $2",
    [userId, serverId]
  );
  return r.rows.length > 0;
}

async function getChannelServerId(channelId) {
  const r = await pool.query(
    "SELECT server_id FROM channels WHERE id = $1",
    [channelId]
  );
  return r.rows[0]?.server_id ?? null;
}

async function canAccessChannel(userId, channelId) {
  const serverId = await getChannelServerId(channelId);
  if (!serverId) return false;
  return isServerMember(userId, serverId);
}

module.exports = { isServerMember, getChannelServerId, canAccessChannel };
