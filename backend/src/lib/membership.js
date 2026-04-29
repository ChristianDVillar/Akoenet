const pool = require("../config/db");
const { getUserServerPermissionKeys, hasAnyServerPermission } = require("./server-permissions");

async function isServerMember(userId, serverId) {
  const banned = await isUserBannedInServer(userId, serverId);
  if (banned) return false;
  const r = await pool.query(
    "SELECT 1 FROM server_members WHERE user_id = $1 AND server_id = $2",
    [userId, serverId]
  );
  return r.rows.length > 0;
}

async function getActiveServerBan(userId, serverId) {
  const r = await pool.query(
    `SELECT id, server_id, user_id, reason, banned_by, expires_at, created_at
     FROM server_bans
     WHERE user_id = $1
       AND server_id = $2
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, serverId]
  );
  return r.rows[0] || null;
}

async function isUserBannedInServer(userId, serverId) {
  const row = await getActiveServerBan(userId, serverId);
  return Boolean(row);
}

async function getChannelServerId(channelId) {
  const r = await pool.query(
    "SELECT server_id FROM channels WHERE id = $1",
    [channelId]
  );
  return r.rows[0]?.server_id ?? null;
}

async function canAccessChannel(userId, channelId) {
  return canReadChannel(userId, channelId);
}

async function getUserServerRoles(userId, serverId) {
  const r = await pool.query(
    `SELECT roles.slug
     FROM user_roles
     JOIN roles ON roles.id = user_roles.role_id
     WHERE user_roles.user_id = $1 AND roles.server_id = $2`,
    [userId, serverId]
  );
  return r.rows.map((row) => String(row.slug || "").toLowerCase());
}

async function canManageChannels(userId, serverId) {
  return hasAnyServerPermission(userId, serverId, ["server_admin", "manage_channels"]);
}

/** Server admins or roles with manage_member_roles (via role_server_permissions). */
async function canManageMemberRoles(userId, serverId) {
  return hasAnyServerPermission(userId, serverId, ["server_admin", "manage_member_roles"]);
}

async function getChannelInfo(channelId) {
  const r = await pool.query(
    "SELECT id, server_id, type, is_private, voice_user_limit FROM channels WHERE id = $1",
    [channelId]
  );
  return r.rows[0] || null;
}

function aggregatePermissionRows(rows) {
  return rows.reduce(
    (acc, row) => ({
      hasRules: true,
      can_view: acc.can_view || row.can_view,
      can_send: acc.can_send || row.can_send,
      can_connect: acc.can_connect || row.can_connect,
    }),
    { hasRules: false, can_view: false, can_send: false, can_connect: false }
  );
}

async function getChannelPermissionsForUser(userId, channelId) {
  const channel = await getChannelInfo(channelId);
  if (!channel) return { allowed: false, can_view: false, can_send: false, can_connect: false };

  const member = await isServerMember(userId, channel.server_id);
  if (!member) return { allowed: false, can_view: false, can_send: false, can_connect: false };

  const permKeys = await getUserServerPermissionKeys(userId, channel.server_id);
  if (permKeys.has("server_admin")) {
    return { allowed: true, can_view: true, can_send: true, can_connect: true, channel };
  }

  const ruleRows = await pool.query(
    `SELECT cp.can_view, cp.can_send, cp.can_connect
     FROM channel_permissions cp
     JOIN roles r ON r.id = cp.role_id
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE cp.channel_id = $1 AND ur.user_id = $2`,
    [channelId, userId]
  );

  const userOverride = await pool.query(
    `SELECT can_view, can_send, can_connect
     FROM channel_user_permissions
     WHERE channel_id = $1 AND user_id = $2`,
    [channelId, userId]
  );
  if (userOverride.rows.length) {
    const u = userOverride.rows[0];
    return {
      allowed: Boolean(u.can_view),
      can_view: Boolean(u.can_view),
      can_send: Boolean(u.can_send),
      can_connect: Boolean(u.can_connect),
      channel,
    };
  }

  let basePermissions;
  if (ruleRows.rows.length === 0) {
    if (channel.is_private) {
      const canAccessByDefault = permKeys.has("access_private_default");
      basePermissions = {
        allowed: canAccessByDefault,
        can_view: canAccessByDefault,
        can_send: canAccessByDefault,
        can_connect: canAccessByDefault,
        channel,
      };
      return basePermissions;
    }
    basePermissions = {
      allowed: true,
      can_view: true,
      can_send: true,
      can_connect: true,
      channel,
    };
  } else {
    const permissions = aggregatePermissionRows(ruleRows.rows);
    basePermissions = {
      allowed: permissions.can_view,
      can_view: permissions.can_view,
      can_send: permissions.can_send,
      can_connect: permissions.can_connect,
      channel,
    };
  }

  return basePermissions;
}

async function canReadChannel(userId, channelId) {
  const p = await getChannelPermissionsForUser(userId, channelId);
  return p.allowed && p.can_view;
}

/** All channel IDs the user can read (for global search). May call `canReadChannel` per channel. */
async function listReadableChannelIds(userId) {
  const r = await pool.query(
    `WITH member_channels AS (
       SELECT c.id, c.server_id, c.is_private
       FROM channels c
       INNER JOIN server_members sm ON sm.server_id = c.server_id AND sm.user_id = $1
       LEFT JOIN server_bans sb
         ON sb.user_id = sm.user_id
        AND sb.server_id = sm.server_id
        AND sb.revoked_at IS NULL
        AND (sb.expires_at IS NULL OR sb.expires_at > NOW())
       WHERE sb.id IS NULL
     ),
     server_perm AS (
       SELECT
         r.server_id,
         bool_or(rsp.permission_key = 'server_admin') AS is_admin,
         bool_or(rsp.permission_key = 'access_private_default') AS access_private_default
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       LEFT JOIN role_server_permissions rsp ON rsp.role_id = r.id
       WHERE ur.user_id = $1
       GROUP BY r.server_id
     ),
     role_channel_perm AS (
       SELECT
         cp.channel_id,
         true AS has_rules,
         bool_or(cp.can_view) AS can_view
       FROM channel_permissions cp
       INNER JOIN roles r ON r.id = cp.role_id
       INNER JOIN user_roles ur ON ur.role_id = r.id AND ur.user_id = $1
       GROUP BY cp.channel_id
     ),
     user_override AS (
       SELECT channel_id, can_view
       FROM channel_user_permissions
       WHERE user_id = $1
     )
     SELECT mc.id
     FROM member_channels mc
     LEFT JOIN server_perm sp ON sp.server_id = mc.server_id
     LEFT JOIN role_channel_perm rcp ON rcp.channel_id = mc.id
     LEFT JOIN user_override uo ON uo.channel_id = mc.id
     WHERE CASE
       WHEN coalesce(sp.is_admin, false) THEN true
       WHEN uo.channel_id IS NOT NULL THEN coalesce(uo.can_view, false)
       WHEN coalesce(rcp.has_rules, false) THEN coalesce(rcp.can_view, false)
       WHEN mc.is_private THEN coalesce(sp.access_private_default, false)
       ELSE true
     END`,
    [userId]
  );
  return r.rows.map((row) => Number(row.id));
}

async function canSendToChannel(userId, channelId) {
  const p = await getChannelPermissionsForUser(userId, channelId);
  return p.allowed && p.can_view && p.can_send;
}

async function canConnectToChannel(userId, channelId) {
  const p = await getChannelPermissionsForUser(userId, channelId);
  return p.allowed && p.can_view && p.can_connect;
}

module.exports = {
  isServerMember,
  getChannelServerId,
  canAccessChannel,
  getUserServerRoles,
  getUserServerPermissionKeys,
  canManageChannels,
  canManageMemberRoles,
  canReadChannel,
  listReadableChannelIds,
  canSendToChannel,
  canConnectToChannel,
  getChannelPermissionsForUser,
  getActiveServerBan,
  isUserBannedInServer,
};
