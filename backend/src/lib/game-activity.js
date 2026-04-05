const pool = require("../config/db");
const { sanitizeUserMediaFields } = require("./sanitize-media-url");

const AUTO_TTL_MS = 120000;
const STEAM_TTL_MS = 120000;

/** @type {Map<number, { game: string, platform: string, ts: number }>} */
const autoByUserId = new Map();
/** @type {Map<number, { game: string, platform: string, ts: number }>} */
const steamByUserId = new Map();
/** @type {Map<number, string>} JSON snapshot of last broadcast activity per user */
const lastBroadcastKey = new Map();
/** @type {Map<number, Map<string, Set<number>>>} serverId -> game -> user ids */
const rankingByServer = new Map();

function setAutoActivity(userId, game, platform) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;
  const g = game != null ? String(game).trim() : "";
  if (!g) {
    autoByUserId.delete(id);
    return;
  }
  autoByUserId.set(id, {
    game: g.slice(0, 120),
    platform: String(platform || "PC").trim().slice(0, 40) || "PC",
    ts: Date.now(),
  });
}

function setSteamActivity(userId, game, platform) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;
  const g = game != null ? String(game).trim() : "";
  if (!g) {
    steamByUserId.delete(id);
    return;
  }
  steamByUserId.set(id, {
    game: g.slice(0, 120),
    platform: String(platform || "Steam").trim().slice(0, 40) || "Steam",
    ts: Date.now(),
  });
}

function clearEphemeralForUser(userId) {
  const id = Number(userId);
  autoByUserId.delete(id);
  steamByUserId.delete(id);
}

function clearSteamActivityForUser(userId) {
  steamByUserId.delete(Number(userId));
}

/**
 * @param {object} row users row with id, share_game_activity, desktop_game_detect_opt_in, steam_id, manual_* 
 */
function resolveActivity(row) {
  if (!row || row.share_game_activity === false) return null;
  const uid = Number(row.id);
  const now = Date.now();

  if (row.desktop_game_detect_opt_in) {
    const a = autoByUserId.get(uid);
    if (a && now - a.ts < AUTO_TTL_MS && a.game) {
      return { game: a.game, platform: a.platform, source: "auto" };
    }
  }

  if (row.steam_id) {
    const s = steamByUserId.get(uid);
    if (s && now - s.ts < STEAM_TTL_MS && s.game) {
      return { game: s.game, platform: s.platform, source: "steam" };
    }
  }

  const manual = row.manual_activity_game != null ? String(row.manual_activity_game).trim() : "";
  if (manual) {
    return {
      game: manual.slice(0, 120),
      platform:
        (row.manual_activity_platform != null ? String(row.manual_activity_platform).trim() : "") ||
        "Manual",
      source: "manual",
    };
  }

  return null;
}

function activityKey(act) {
  return act ? JSON.stringify(act) : "";
}

function updateRanking(io, serverId, userId, prev, next) {
  const sid = Number(serverId);
  const uid = Number(userId);
  if (!Number.isInteger(sid) || !Number.isInteger(uid)) return;

  let map = rankingByServer.get(sid);
  if (!map) {
    map = new Map();
    rankingByServer.set(sid, map);
  }

  const pg = prev?.game;
  const ng = next?.game;

  if (pg) {
    const set = map.get(pg);
    if (set) {
      set.delete(uid);
      if (set.size === 0) map.delete(pg);
    }
  }
  if (ng) {
    if (!map.has(ng)) map.set(ng, new Set());
    map.get(ng).add(uid);
  }

  const top = [...map.entries()]
    .map(([game, set]) => ({ game, players: set.size }))
    .sort((a, b) => b.players - a.players || a.game.localeCompare(b.game))
    .slice(0, 10);

  io.to(`server:${sid}`).emit("server:game_ranking", { serverId: sid, top });
}

/**
 * Load game-related user fields and push diffs to all servers this user is in.
 * @param {import("socket.io").Server} io
 * @param {number} userId
 */
async function notifyGameActivityChange(io, userId) {
  if (!io || userId == null) return;
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return;

  const r = await pool.query(
    `SELECT id, steam_id, share_game_activity, desktop_game_detect_opt_in,
            manual_activity_game, manual_activity_platform
     FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [uid]
  );
  if (!r.rows.length) return;
  const row = r.rows[0];
  const next = resolveActivity(row);
  const nextK = activityKey(next);
  const prevK = lastBroadcastKey.get(uid);
  if (prevK === nextK) return;

  const prev = prevK ? JSON.parse(prevK) : null;
  lastBroadcastKey.set(uid, nextK);

  const servers = await pool.query(`SELECT server_id FROM server_members WHERE user_id = $1`, [uid]);
  for (const { server_id } of servers.rows) {
    updateRanking(io, server_id, uid, prev, next);
    io.to(`server:${server_id}`).emit("server:game_activity", {
      serverId: server_id,
      userId: uid,
      activity: next,
    });
  }
}

function rankingSnapshotForServer(serverId) {
  const sid = Number(serverId);
  const map = rankingByServer.get(sid);
  if (!map || map.size === 0) return [];
  return [...map.entries()]
    .map(([game, set]) => ({ game, players: set.size }))
    .sort((a, b) => b.players - a.players || a.game.localeCompare(b.game))
    .slice(0, 10);
}

/**
 * Shape member row for GET /servers/:id/members (hides prefs, exposes activity only).
 */
function shapeMemberRowForPublicApi(row, connectedSet) {
  const normalized = String(row?.presence_status || "").toLowerCase();
  const isConnected = connectedSet.has(Number(row?.id));
  const presence_status = isConnected ? normalized || "online" : "offline";

  const forResolve = {
    id: row.id,
    steam_id: row.steam_id,
    share_game_activity: row.share_game_activity,
    desktop_game_detect_opt_in: row.desktop_game_detect_opt_in,
    manual_activity_game: row.manual_activity_game,
    manual_activity_platform: row.manual_activity_platform,
  };
  const activity = resolveActivity(forResolve);

  const {
    steam_id: _st,
    share_game_activity: _sg,
    desktop_game_detect_opt_in: _dg,
    manual_activity_game: _mg,
    manual_activity_platform: _mp,
    ...rest
  } = row;

  return sanitizeUserMediaFields({
    ...rest,
    presence_status,
    activity,
  });
}

async function fetchGameActivitySnapshotForServer(serverId) {
  const sid = Number(serverId);
  const result = await pool.query(
    `SELECT u.id, u.steam_id, u.share_game_activity, u.desktop_game_detect_opt_in,
            u.manual_activity_game, u.manual_activity_platform
     FROM server_members m
     JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL
     WHERE m.server_id = $1`,
    [sid]
  );
  const entries = result.rows.map((row) => ({
    userId: row.id,
    activity: resolveActivity(row),
  }));
  return entries;
}

module.exports = {
  AUTO_TTL_MS,
  STEAM_TTL_MS,
  setAutoActivity,
  setSteamActivity,
  clearEphemeralForUser,
  clearSteamActivityForUser,
  resolveActivity,
  notifyGameActivityChange,
  shapeMemberRowForPublicApi,
  fetchGameActivitySnapshotForServer,
  rankingSnapshotForServer,
  steamByUserId,
  autoByUserId,
};
