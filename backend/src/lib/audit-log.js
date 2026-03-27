const pool = require("../config/db");

async function logAdminAction({
  actorUserId,
  action,
  targetMessageId = null,
  channelId = null,
  serverId = null,
  metadata = {},
}) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_logs
       (actor_user_id, action, target_message_id, channel_id, server_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actorUserId, action, targetMessageId, channelId, serverId, JSON.stringify(metadata || {})]
    );
  } catch {
    // Non-blocking on purpose: audit logging should not break user operations.
  }
}

module.exports = { logAdminAction };
