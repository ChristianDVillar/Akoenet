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
  return canReadChannel(userId, channelId);
}

async function getUserServerRoles(userId, serverId) {
  const r = await pool.query(
    `SELECT roles.name
     FROM user_roles
     JOIN roles ON roles.id = user_roles.role_id
     WHERE user_roles.user_id = $1 AND roles.server_id = $2`,
    [userId, serverId]
  );
  return r.rows.map((row) => row.name);
}

async function canManageChannels(userId, serverId) {
  const roles = await getUserServerRoles(userId, serverId);
  return roles.includes("admin") || roles.includes("moderator");
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

  const roles = await getUserServerRoles(userId, channel.server_id);
  const isAdmin = roles.includes("admin");
  const isModerator = roles.includes("moderator");
  if (isAdmin) {
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
      const canAccessByDefault = isModerator;
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
    `SELECT c.id
     FROM channels c
     INNER JOIN server_members sm ON sm.server_id = c.server_id AND sm.user_id = $1`,
    [userId]
  );
  const out = [];
  for (const row of r.rows) {
    const cid = Number(row.id);
    if (await canReadChannel(userId, cid)) out.push(cid);
  }
  return out;
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
  canManageChannels,
  canReadChannel,
  listReadableChannelIds,
  canSendToChannel,
  canConnectToChannel,
  getChannelPermissionsForUser,
};
