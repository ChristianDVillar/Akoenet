const { canManageChannels } = require("./membership");

const MENTION_RE = /@(here|everyone|[a-zA-Z0-9_.]{2,32})/g;

/**
 * @param {string} text
 * @returns {{ usernames: string[], everyone: boolean, here: boolean }}
 */
function parseChannelMentions(text) {
  if (!text || typeof text !== "string") {
    return { usernames: [], everyone: false, here: false };
  }
  const seen = new Set();
  const usernames = [];
  let everyone = false;
  let here = false;
  let m;
  const re = new RegExp(MENTION_RE.source, "g");
  while ((m = re.exec(text)) !== null) {
    const raw = m[1];
    const lower = raw.toLowerCase();
    if (lower === "everyone") {
      everyone = true;
      continue;
    }
    if (lower === "here") {
      here = true;
      continue;
    }
    const key = lower;
    if (!seen.has(key)) {
      seen.add(key);
      usernames.push(raw);
    }
  }
  return { usernames, everyone, here };
}

const MAX_TARGETS = 120;

/**
 * @param {import("pg").Pool} pool
 * @param {number} serverId
 * @param {string[]} usernames raw segments (case preserved for display; match is case-insensitive)
 */
async function resolveMentionedMemberIds(pool, serverId, usernames) {
  if (!usernames.length) return [];
  const lowered = usernames.map((u) => u.toLowerCase());
  const r = await pool.query(
    `SELECT DISTINCT u.id
     FROM users u
     INNER JOIN server_members sm ON sm.user_id = u.id AND sm.server_id = $1
     WHERE LOWER(u.username) = ANY($2::text[])`,
    [serverId, lowered]
  );
  return r.rows.map((row) => Number(row.id));
}

async function getServerMemberIds(pool, serverId, excludeUserId) {
  const r = await pool.query(
    `SELECT user_id FROM server_members WHERE server_id = $1 AND user_id <> $2`,
    [serverId, excludeUserId]
  );
  return r.rows.map((row) => Number(row.user_id));
}

/**
 * Emit lightweight in-app notifications for @user and @everyone (mods+).
 * @everyone only if sender can manage channels (admin/moderator).
 * @here: no extra signal in MVP (same as omitting).
 */
async function notifyChannelMentions(io, pool, { serverId, channelId, messageId, senderId, content }) {
  if (!io || !content) return;
  const parsed = parseChannelMentions(content);
  const targets = new Set();

  const userIds = await resolveMentionedMemberIds(pool, serverId, parsed.usernames);
  for (const uid of userIds) {
    if (uid !== senderId) targets.add(uid);
  }

  if (parsed.everyone) {
    const allowed = await canManageChannels(senderId, serverId);
    if (allowed) {
      const all = await getServerMemberIds(pool, serverId, senderId);
      for (const uid of all) targets.add(uid);
    }
  }

  if (targets.size === 0) return;

  const meta = await pool.query(
    `SELECT c.name AS channel_name, s.name AS server_name, u.username AS from_username
     FROM channels c
     JOIN servers s ON s.id = c.server_id
     JOIN users u ON u.id = $2
     WHERE c.id = $1`,
    [channelId, senderId]
  );
  const row = meta.rows[0] || {};
  const snippet = String(content).trim().slice(0, 140);

  let n = 0;
  for (const uid of targets) {
    if (n >= MAX_TARGETS) break;
    n += 1;
    io.to(`user:${uid}`).emit("in_app_notification", {
      type: "mention",
      channel_id: channelId,
      server_id: serverId,
      message_id: messageId,
      from_username: row.from_username || "user",
      channel_name: row.channel_name || "channel",
      server_name: row.server_name || "server",
      snippet,
    });
  }
}

module.exports = {
  MENTION_RE,
  parseChannelMentions,
  notifyChannelMentions,
};
