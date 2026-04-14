const pool = require("../config/db");

/** @type {readonly string[]} */
const PERMISSION_KEYS = [
  "server_admin",
  "manage_channels",
  "manage_member_roles",
  "manage_invites",
  "manage_emojis",
  "access_private_default",
  "manage_messages",
];

const PERMISSION_KEY_SET = new Set(PERMISSION_KEYS);

const SYSTEM_SLUGS = new Set(["admin", "moderator", "member"]);

function isValidPermissionKey(key) {
  return typeof key === "string" && PERMISSION_KEY_SET.has(key);
}

function sanitizePermissionList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const x of raw) {
    const k = String(x || "").trim();
    if (!isValidPermissionKey(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/** Default permission rows for built-in slugs when creating a server. */
function defaultPermissionsForBuiltinSlug(slug) {
  const s = String(slug || "").toLowerCase();
  if (s === "admin") return ["server_admin"];
  if (s === "moderator") {
    return [
      "manage_channels",
      "manage_invites",
      "manage_emojis",
      "access_private_default",
      "manage_messages",
    ];
  }
  return [];
}

/**
 * @param {import('pg').PoolClient} client
 * @param {number} roleId
 * @param {string[]} keys
 */
async function replaceRolePermissions(client, roleId, keys) {
  await client.query(`DELETE FROM role_server_permissions WHERE role_id = $1`, [roleId]);
  for (const k of keys) {
    await client.query(`INSERT INTO role_server_permissions (role_id, permission_key) VALUES ($1, $2)`, [
      roleId,
      k,
    ]);
  }
}

/** @param {number} roleId */
async function replaceRolePermissionsForRole(roleId, rawKeys) {
  const keys = sanitizePermissionList(rawKeys);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await replaceRolePermissions(client, roleId, keys);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {number} roleId
 * @param {string} builtinSlug admin | moderator | member
 */
async function seedBuiltinRolePermissions(client, roleId, builtinSlug) {
  const keys = defaultPermissionsForBuiltinSlug(builtinSlug);
  if (!keys.length) return;
  await replaceRolePermissions(client, roleId, keys);
}

/**
 * @param {number} userId
 * @param {number|string} serverId
 * @returns {Promise<Set<string>>}
 */
async function getUserServerPermissionKeys(userId, serverId) {
  const sid = Number(serverId);
  const r = await pool.query(
    `SELECT DISTINCT rsp.permission_key
     FROM user_roles ur
     INNER JOIN roles r ON r.id = ur.role_id AND r.server_id = $2
     INNER JOIN role_server_permissions rsp ON rsp.role_id = r.id
     WHERE ur.user_id = $1`,
    [userId, sid]
  );
  return new Set(r.rows.map((row) => String(row.permission_key || "")));
}

/**
 * @param {number} userId
 * @param {number|string} serverId
 * @param {string} key
 */
async function hasServerPermission(userId, serverId, key) {
  const keys = await getUserServerPermissionKeys(userId, serverId);
  return keys.has(key);
}

/**
 * @param {number} userId
 * @param {number|string} serverId
 * @param {string[]} anyOf
 */
async function hasAnyServerPermission(userId, serverId, anyOf) {
  const keys = await getUserServerPermissionKeys(userId, serverId);
  for (const k of anyOf) {
    if (keys.has(k)) return true;
  }
  return false;
}

function isSystemSlug(slug) {
  return SYSTEM_SLUGS.has(String(slug || "").toLowerCase());
}

module.exports = {
  PERMISSION_KEYS,
  PERMISSION_KEY_SET,
  SYSTEM_SLUGS,
  isValidPermissionKey,
  sanitizePermissionList,
  defaultPermissionsForBuiltinSlug,
  replaceRolePermissions,
  replaceRolePermissionsForRole,
  seedBuiltinRolePermissions,
  getUserServerPermissionKeys,
  hasServerPermission,
  hasAnyServerPermission,
  isSystemSlug,
};
