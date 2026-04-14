const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const {
  canReadChannel,
  canSendToChannel,
  getChannelPermissionsForUser,
  getChannelServerId,
  canManageChannels,
} = require("../lib/membership");
const { logAdminAction } = require("../lib/audit-log");
const { getMessageReactions } = require("../lib/message-reactions");
const { broadcastChannelMessage } = require("../lib/channel-message-broadcast");
const {
  fetchUpcomingEvents,
  formatScheduleReply,
  parseSchedulerChatCommand,
} = require("../lib/scheduler-client");
const { parseServerCustomCommandText } = require("../lib/custom-server-command");
const { resolveSchedulerStreamerSlug } = require("../lib/scheduler-resolve");
const { appEvents } = require("../lib/app-events");
const { sanitizeMediaUrl, sanitizeImageUrlField } = require("../lib/sanitize-media-url");
const { getJwtSecret } = require("../lib/jwt-secret");
const { textContainsBlockedLanguage } = require("../lib/blocked-content");
const { notifyChannelMentions } = require("../lib/mentions");
const { areUsersBlocked } = require("../lib/social-guard");
const { recordDmMessage } = require("../lib/runtime-metrics");
const logger = require("../lib/logger");
const {
  setAutoActivity,
  clearEphemeralForUser,
  setSteamActivity,
  notifyGameActivityChange,
  fetchGameActivitySnapshotForServer,
  rankingSnapshotForServer,
} = require("../lib/game-activity");

/** Set on first initSocket(io) — used by GET /servers/:id/voice-presence */
let getVoicePresenceSnapshotForServerImpl = null;
/** Set on first initSocket(io) — used by routes to compute effective online status */
let getConnectedUserIdsForServerImpl = null;
/** Set on first initSocket(io) — used by routes to compute effective online status globally */
let getConnectedUserIdsGlobalImpl = null;

function initSocket(io) {
  const secret = getJwtSecret();
  const voiceRooms = new Map();
  const directTypingLastEmit = new Map();
  const messageWindowMs = 60 * 1000;
  const messageLimitPerWindow = Number(process.env.SOCKET_MESSAGE_RATE_LIMIT_MAX || 40);
  const directMessageLimitPerWindow = Number(process.env.SOCKET_DM_RATE_LIMIT_MAX || 30);
  const schedulerCommandLimitPerWindow = Number(process.env.SCHEDULER_SOCKET_RATE_LIMIT_MAX || 15);
  const customServerCommandLimitPerWindow = Number(process.env.CUSTOM_SERVER_COMMAND_RATE_LIMIT_MAX || 20);
  const gameActivityAutoLimitPerWindow = Number(process.env.GAME_ACTIVITY_SOCKET_RATE_LIMIT_MAX || 24);
  const schedulerBotAvatarUrl = String(
    process.env.SCHEDULER_BOT_AVATAR_URL ||
      (process.env.FRONTEND_URL
        ? `${String(process.env.FRONTEND_URL).replace(/\/+$/, "")}/RoundLogoBlack.png`
        : "") ||
      "https://akoenet-frontend.onrender.com/RoundLogoBlack.png"
  ).trim();
  const socketRateState = new Map();
  const typingLastEmit = new Map();
  /** serverId -> Map<userId, socketCount> */
  const serverPresence = new Map();
  /** userId -> socketCount (all app sessions, any screen) */
  const globalPresence = new Map();

  function getServerPresenceMap(serverId) {
    if (!serverPresence.has(serverId)) {
      serverPresence.set(serverId, new Map());
    }
    return serverPresence.get(serverId);
  }

  function buildConnectedUserIds(serverId) {
    const map = serverPresence.get(serverId);
    if (!map) return [];
    return [...map.entries()]
      .filter(([, count]) => Number(count) > 0)
      .map(([uid]) => Number(uid));
  }

  function emitServerPresence(serverId) {
    io.to(`server:${serverId}`).emit("server:presence_update", {
      serverId,
      connectedUserIds: buildConnectedUserIds(serverId),
    });
  }

  function buildConnectedUserIdsGlobal() {
    return [...globalPresence.entries()]
      .filter(([, count]) => Number(count) > 0)
      .map(([uid]) => Number(uid));
  }

  function addUserToGlobalPresence(userId) {
    globalPresence.set(userId, (globalPresence.get(userId) || 0) + 1);
  }

  function removeUserFromGlobalPresence(userId) {
    const next = (globalPresence.get(userId) || 0) - 1;
    if (next <= 0) globalPresence.delete(userId);
    else globalPresence.set(userId, next);
  }

  function addUserToServerPresence(serverId, userId) {
    const map = getServerPresenceMap(serverId);
    map.set(userId, (map.get(userId) || 0) + 1);
    emitServerPresence(serverId);
  }

  function removeUserFromServerPresence(serverId, userId) {
    const map = serverPresence.get(serverId);
    if (!map) return;
    const next = (map.get(userId) || 0) - 1;
    if (next <= 0) map.delete(userId);
    else map.set(userId, next);
    if (map.size === 0) serverPresence.delete(serverId);
    emitServerPresence(serverId);
  }

  function canPassRateLimit(userId, bucket, maxAllowed) {
    const now = Date.now();
    const key = `${userId}:${bucket}`;
    const current = socketRateState.get(key);
    if (!current || current.resetAt <= now) {
      socketRateState.set(key, { count: 1, resetAt: now + messageWindowMs });
      return true;
    }
    if (current.count >= maxAllowed) {
      return false;
    }
    current.count += 1;
    return true;
  }

  function getRoom(channelId) {
    if (!voiceRooms.has(channelId)) {
      voiceRooms.set(channelId, new Map());
    }
    return voiceRooms.get(channelId);
  }

  function dedupeVoiceUsers(room) {
    const byUser = new Map();
    for (const p of room.values()) {
      const micMuted = Boolean(p.mic_muted);
      const deafened = Boolean(p.deafened);
      if (!byUser.has(p.userId)) {
        byUser.set(p.userId, {
          userId: p.userId,
          username: p.username,
          socketId: p.socketId,
          mic_muted: micMuted,
          deafened,
        });
      } else {
        const ex = byUser.get(p.userId);
        ex.mic_muted = ex.mic_muted || micMuted;
        ex.deafened = ex.deafened || deafened;
      }
    }
    return Array.from(byUser.values());
  }

  async function enrichVoiceParticipants(partials) {
    if (!partials.length) return [];
    const ids = [...new Set(partials.map((p) => p.userId))];
    const r = await pool.query(
      `SELECT id, username, avatar_url FROM users WHERE id = ANY($1::int[])`,
      [ids]
    );
    const dbMap = new Map(r.rows.map((row) => [row.id, row]));
    return partials.map((p) => {
      const db = dbMap.get(p.userId);
      const rawAvatar = db?.avatar_url ?? null;
      return {
        ...p,
        username: db?.username ?? p.username,
        avatar_url: rawAvatar != null ? sanitizeMediaUrl(rawAvatar) : null,
      };
    });
  }

  async function emitVoicePresence(channelId, notifySocket = null) {
    const serverId = await getChannelServerId(channelId);
    if (!serverId) return;
    const room = voiceRooms.get(channelId);
    const partial = room && room.size > 0 ? dedupeVoiceUsers(room) : [];
    const participants = await enrichVoiceParticipants(partial);
    const payload = { channelId, participants };
    io.to(`server:${serverId}`).emit("voice:presence", payload);
    /* Client may still not be in server:${serverId} if voice:join ran before join_server finished */
    if (notifySocket && notifySocket.connected) {
      notifySocket.emit("voice:presence", payload);
    }
  }

  async function buildVoiceSnapshotForServer(serverId) {
    const chRes = await pool.query(
      `SELECT id FROM channels WHERE server_id = $1 AND type = 'voice'`,
      [serverId]
    );
    const presence = {};
    for (const row of chRes.rows) {
      const room = voiceRooms.get(row.id);
      if (room && room.size > 0) {
        presence[row.id] = await enrichVoiceParticipants(dedupeVoiceUsers(room));
      }
    }
    return presence;
  }

  getVoicePresenceSnapshotForServerImpl = buildVoiceSnapshotForServer;
  getConnectedUserIdsForServerImpl = (serverId) => buildConnectedUserIds(serverId);
  getConnectedUserIdsGlobalImpl = () => buildConnectedUserIdsGlobal();

  const steamWebApiKey = String(process.env.STEAM_WEB_API_KEY || "").trim();
  let steamPollBusy = false;
  setInterval(() => {
    if (!steamWebApiKey || steamPollBusy) return;
    const userIds = buildConnectedUserIdsGlobal();
    if (!userIds.length) return;
    steamPollBusy = true;
    (async () => {
      try {
        const r = await pool.query(
          `SELECT id, steam_id FROM users
           WHERE id = ANY($1::int[])
             AND deleted_at IS NULL
             AND steam_id IS NOT NULL
             AND COALESCE(share_game_activity, true) = true`,
          [userIds]
        );
        const rows = r.rows;
        for (let i = 0; i < rows.length; i += 80) {
          const chunk = rows.slice(i, i + 80);
          const ids = chunk.map((c) => c.steam_id).join(",");
          const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
          url.searchParams.set("key", steamWebApiKey);
          url.searchParams.set("steamids", ids);
          const res = await fetch(url);
          if (!res.ok) continue;
          const data = await res.json();
          const players = data?.response?.players || [];
          const bySteam = new Map(players.map((p) => [String(p.steamid), p]));
          for (const row of chunk) {
            const steamPlayer = bySteam.get(String(row.steam_id));
            const game = steamPlayer?.gameextrainfo ? String(steamPlayer.gameextrainfo).trim() : "";
            setSteamActivity(row.id, game, "Steam");
            await notifyGameActivityChange(io, row.id);
          }
        }
      } catch (e) {
        logger.warn({ err: e }, "Steam presence poll failed");
      } finally {
        steamPollBusy = false;
      }
    })();
  }, 45000);

  function removeFromVoiceRooms(socketId) {
    const affected = [];
    for (const [channelId, room] of voiceRooms.entries()) {
      if (room.has(socketId)) {
        room.delete(socketId);
        io.to(`voice:${channelId}`).emit("voice:user-left", { socketId });
        affected.push(channelId);
        if (room.size === 0) voiceRooms.delete(channelId);
      }
    }
    affected.forEach((cid) => {
      emitVoicePresence(cid, null).catch(() => {});
    });
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("unauthorized"));
    }
    try {
      const decoded = jwt.verify(token, secret);
      const userId = Number(decoded.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return next(new Error("unauthorized"));
      }
      pool
        .query("SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL", [userId])
        .then((r) => {
          if (!r.rows.length) return next(new Error("unauthorized"));
          socket.userId = userId;
          next();
        })
        .catch(() => next(new Error("unauthorized")));
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.data.joinedServers = new Set();
    socket.join(`user:${socket.userId}`);
    addUserToGlobalPresence(socket.userId);

    socket.on("join_server", async (serverId) => {
      const id = parseInt(serverId, 10);
      if (Number.isNaN(id)) return;
      const r = await pool.query(
        "SELECT 1 FROM server_members WHERE user_id = $1 AND server_id = $2",
        [socket.userId, id]
      );
      if (r.rows.length) {
        if (!socket.data.joinedServers.has(id)) {
          socket.data.joinedServers.add(id);
          addUserToServerPresence(id, socket.userId);
        }
        socket.join(`server:${id}`);
        try {
          const presence = await buildVoiceSnapshotForServer(id);
          socket.emit("voice:presence_snapshot", { serverId: id, presence });
          socket.emit("server:presence_snapshot", {
            serverId: id,
            connectedUserIds: buildConnectedUserIds(id),
          });
          const entries = await fetchGameActivitySnapshotForServer(id);
          const ranking = rankingSnapshotForServer(id);
          socket.emit("server:game_activity_snapshot", { serverId: id, entries, ranking });
        } catch {
          /* ignore snapshot errors */
        }
      }
    });

    socket.on("game_activity:auto", async (payload) => {
      if (!canPassRateLimit(socket.userId, "game_activity_auto", gameActivityAutoLimitPerWindow)) {
        return;
      }
      const pref = await pool.query(
        `SELECT desktop_game_detect_opt_in, share_game_activity FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [socket.userId]
      );
      if (!pref.rows.length) return;
      const row = pref.rows[0];
      if (!row.desktop_game_detect_opt_in || row.share_game_activity === false) return;
      const game = typeof payload?.game === "string" ? payload.game.trim().slice(0, 120) : "";
      const platformRaw = typeof payload?.platform === "string" ? payload.platform.trim().slice(0, 40) : "";
      if (!game) {
        setAutoActivity(socket.userId, "", "");
      } else {
        setAutoActivity(socket.userId, game, platformRaw || "PC");
      }
      await notifyGameActivityChange(io, socket.userId);
    });

    socket.on("leave_server", (serverId) => {
      const id = parseInt(serverId, 10);
      if (!Number.isNaN(id)) {
        socket.leave(`server:${id}`);
        if (socket.data.joinedServers.has(id)) {
          socket.data.joinedServers.delete(id);
          removeUserFromServerPresence(id, socket.userId);
        }
      }
    });

    socket.on("join_channel", async (channelId, cb) => {
      const id = parseInt(channelId, 10);
      if (Number.isNaN(id)) {
        if (typeof cb === "function") cb({ error: "invalid" });
        return;
      }
      const ok = await canReadChannel(socket.userId, id);
      if (!ok) {
        if (typeof cb === "function") cb({ error: "forbidden" });
        return;
      }
      socket.join(`channel:${id}`);
      if (typeof cb === "function") cb({ ok: true });
    });

    socket.on("leave_channel", (channelId) => {
      const id = parseInt(channelId, 10);
      if (!Number.isNaN(id)) socket.leave(`channel:${id}`);
    });

    socket.on("channel_typing", async (payload) => {
      const channelId = parseInt(payload?.channel_id, 10);
      if (Number.isNaN(channelId)) return;
      if (!(await canReadChannel(socket.userId, channelId))) return;
      const typing = payload?.typing !== false;
      if (typing) {
        const key = `${socket.userId}:${channelId}`;
        const now = Date.now();
        const last = typingLastEmit.get(key) || 0;
        if (now - last < 2000) return;
        typingLastEmit.set(key, now);
      }
      const u = await pool.query("SELECT username, avatar_url FROM users WHERE id = $1", [socket.userId]);
      const username = u.rows[0]?.username || `user_${socket.userId}`;
      socket.to(`channel:${channelId}`).emit("channel_typing", {
        channel_id: channelId,
        user_id: socket.userId,
        username,
        typing,
      });
    });

    socket.on("send_message", async (payload, ack) => {
      if (!canPassRateLimit(socket.userId, "channel_message", messageLimitPerWindow)) {
        if (typeof ack === "function") ack({ error: "rate_limited" });
        return;
      }
      const channelId = parseInt(payload?.channel_id, 10);
      const content = typeof payload?.content === "string" ? payload.content : "";
      const imageUrl = payload?.image_url || null;
      const schCmd = !imageUrl && content.trim() ? parseSchedulerChatCommand(content.trim()) : null;

      if (schCmd) {
        if (!canPassRateLimit(socket.userId, "scheduler_command", schedulerCommandLimitPerWindow)) {
          if (typeof ack === "function") ack({ error: "rate_limited" });
          return;
        }
      } else if (!canPassRateLimit(socket.userId, "channel_message", messageLimitPerWindow)) {
        if (typeof ack === "function") ack({ error: "rate_limited" });
        return;
      }

      if (Number.isNaN(channelId)) {
        if (typeof ack === "function") ack({ error: "invalid" });
        return;
      }
      if (!content.trim() && !imageUrl) {
        if (typeof ack === "function") ack({ error: "empty" });
        return;
      }
      const userText = content.trim();
      if (userText && textContainsBlockedLanguage(userText, { source: "socket_channel_message", userId: socket.userId })) {
        if (typeof ack === "function") ack({ error: "blocked_content" });
        return;
      }
      const perms = await getChannelPermissionsForUser(socket.userId, channelId);
      if (!perms.allowed) {
        if (typeof ack === "function") ack({ error: "forbidden" });
        return;
      }
      /** Texto / imagen en canal de voz: permiso de envío de mensajes (can_send), no unirse al audio (can_connect). */
      if (!(await canSendToChannel(socket.userId, channelId))) {
        if (typeof ack === "function") ack({ error: "send_forbidden" });
        return;
      }

      const serverId = await getChannelServerId(channelId);
      try {
        if (schCmd) {
          const result = await pool.query(
            `INSERT INTO messages (channel_id, user_id, content, image_url, thread_root_message_id)
             VALUES ($1, $2, $3, NULL, NULL)
             RETURNING *`,
            [channelId, socket.userId, content.trim()]
          );
          const row = result.rows[0];
          const u = await pool.query("SELECT username, avatar_url FROM users WHERE id = $1", [socket.userId]);
          const userMessage = {
            ...row,
            username: u.rows[0]?.username,
            avatar_url: u.rows[0]?.avatar_url ? sanitizeMediaUrl(u.rows[0].avatar_url) : null,
            reactions: [],
          };
          io.to(`channel:${channelId}`).emit("receive_message", userMessage);
          if (content.trim()) {
            notifyChannelMentions(io, pool, {
              serverId,
              channelId,
              messageId: userMessage.id,
              senderId: socket.userId,
              content: content.trim(),
            }).catch(() => {});
          }
          const snippet = content.trim().slice(0, 80);
          io.to(`server:${serverId}`).emit("echonet_notification", {
            serverId,
            channelId,
            username: userMessage.username,
            snippet,
            messageId: userMessage.id,
          });

          const defaultStreamer = String(process.env.SCHEDULER_DEFAULT_STREAMER_USERNAME || "").trim();
          const targetUser = (schCmd.username || defaultStreamer).trim();
          const announcerId = Number(process.env.SCHEDULER_ANNOUNCER_USER_ID || 0);

          let replyText;
          if (!targetUser) {
            replyText =
              "📅 Specify the streamer: `!schedule username` or set SCHEDULER_DEFAULT_STREAMER_USERNAME.";
          } else {
            const schedulerSlug = await resolveSchedulerStreamerSlug(pool, targetUser);
            const fetched = await fetchUpcomingEvents(schedulerSlug);
            if (!fetched.ok) {
              replyText =
                "📅 Could not load the Scheduler calendar (check SCHEDULER_API_BASE_URL or your network).";
            } else {
              const mode = schCmd.mode === "next" ? "next" : "all";
              replyText = formatScheduleReply(fetched.events, mode);
            }
          }

          const replyUserId = Number.isInteger(announcerId) && announcerId > 0 ? announcerId : socket.userId;
          const replyBody =
            replyUserId === socket.userId ? `📅 [Scheduler]\n${replyText}` : replyText;
          const botMessage = await broadcastChannelMessage(io, pool, {
            channelId,
            userId: replyUserId,
            content: replyBody,
            overrideUsername: "Scheduler",
            overrideAvatarUrl: schedulerBotAvatarUrl || null,
          });

          appEvents.emit("message.created", {
            channelId,
            messageId: userMessage.id,
            userId: socket.userId,
            serverId,
          });
          appEvents.emit("message.created", {
            channelId,
            messageId: botMessage.id,
            userId: replyUserId,
            serverId,
          });

          if (typeof ack === "function") {
            ack({
              ok: true,
              message: userMessage,
              scheduler_reply: botMessage,
            });
          }
          return;
        }

        const customMatch = !imageUrl && userText ? parseServerCustomCommandText(userText) : null;
        if (customMatch) {
          const cmdLookup = await pool.query(
            `SELECT id, response FROM server_custom_commands WHERE server_id = $1 AND command_name = $2`,
            [serverId, customMatch.name]
          );
          if (cmdLookup.rows.length) {
            if (!canPassRateLimit(socket.userId, "custom_server_command", customServerCommandLimitPerWindow)) {
              if (typeof ack === "function") ack({ error: "rate_limited" });
              return;
            }
            const result = await pool.query(
              `INSERT INTO messages (channel_id, user_id, content, image_url, thread_root_message_id)
               VALUES ($1, $2, $3, NULL, NULL)
               RETURNING *`,
              [channelId, socket.userId, content.trim()]
            );
            const row = result.rows[0];
            const u = await pool.query("SELECT username, avatar_url FROM users WHERE id = $1", [socket.userId]);
            const userMessage = {
              ...row,
              username: u.rows[0]?.username,
              avatar_url: u.rows[0]?.avatar_url ? sanitizeMediaUrl(u.rows[0].avatar_url) : null,
              reactions: [],
            };
            io.to(`channel:${channelId}`).emit("receive_message", userMessage);
            if (content.trim()) {
              notifyChannelMentions(io, pool, {
                serverId,
                channelId,
                messageId: userMessage.id,
                senderId: socket.userId,
                content: content.trim(),
              }).catch(() => {});
            }
            const snippet = content.trim().slice(0, 80);
            io.to(`server:${serverId}`).emit("echonet_notification", {
              serverId,
              channelId,
              username: userMessage.username,
              snippet,
              messageId: userMessage.id,
            });

            let replyText = String(cmdLookup.rows[0].response || "").trim();
            if (
              replyText &&
              textContainsBlockedLanguage(replyText, {
                source: "socket_custom_command_response",
                userId: socket.userId,
              })
            ) {
              replyText =
                "_(This command reply was blocked by the server content filter. Ask a moderator to edit the command.)_";
            }
            if (!replyText) {
              replyText = "_(No response text is set for this command.)_";
            }

            const fullBot = `⚙️ **!${customMatch.name}**\n${replyText}`;
            const botMessage = await broadcastChannelMessage(io, pool, {
              channelId,
              userId: socket.userId,
              content: fullBot,
            });
            notifyChannelMentions(io, pool, {
              serverId,
              channelId,
              messageId: botMessage.id,
              senderId: socket.userId,
              content: fullBot,
            }).catch(() => {});

            appEvents.emit("message.created", {
              channelId,
              messageId: userMessage.id,
              userId: socket.userId,
              serverId,
            });
            appEvents.emit("message.created", {
              channelId,
              messageId: botMessage.id,
              userId: socket.userId,
              serverId,
            });

            if (typeof ack === "function") {
              ack({
                ok: true,
                message: userMessage,
                custom_command_reply: botMessage,
              });
            }
            return;
          }
        }

        const replyToRaw = parseInt(payload?.reply_to_message_id, 10);
        let replyToId = null;
        if (!Number.isNaN(replyToRaw) && replyToRaw > 0) {
          const replyCheck = await pool.query(
            `SELECT id, channel_id FROM messages WHERE id = $1`,
            [replyToRaw]
          );
          if (
            replyCheck.rows.length &&
            Number(replyCheck.rows[0].channel_id) === channelId
          ) {
            replyToId = replyToRaw;
          }
        }

        const threadRootRaw = parseInt(payload?.thread_root_message_id, 10);
        let threadRootId = null;
        if (!Number.isNaN(threadRootRaw) && threadRootRaw > 0) {
          const trCheck = await pool.query(`SELECT id, channel_id FROM messages WHERE id = $1`, [threadRootRaw]);
          if (trCheck.rows.length && Number(trCheck.rows[0].channel_id) === channelId) {
            threadRootId = threadRootRaw;
          }
        }

        const dupWindowSec = Math.min(300, Math.max(10, parseInt(process.env.CHAT_DUPLICATE_WINDOW_SEC || "60", 10)));
        if (userText) {
          const dup = await pool.query(
            `SELECT id FROM messages
             WHERE channel_id = $1 AND user_id = $2 AND content = $3
               AND created_at > NOW() - ($4::int * INTERVAL '1 second')
             LIMIT 1`,
            [channelId, socket.userId, userText, dupWindowSec]
          );
          if (dup.rows.length) {
            if (typeof ack === "function") {
              ack({ error: "duplicate_message", message: "Duplicate content; wait before sending again." });
            }
            return;
          }
        }

        const result = await pool.query(
          `WITH ins AS (
             INSERT INTO messages (channel_id, user_id, content, image_url, reply_to_id, thread_root_message_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *
           )
           SELECT ins.*, u.username, u.avatar_url
           FROM ins
           JOIN users u ON u.id = ins.user_id`,
          [channelId, socket.userId, content.trim() || "(imagen)", imageUrl, replyToId, threadRootId]
        );
        const row = result.rows[0];
        let replyPreviewContent = null;
        let replyPreviewUsername = null;
        if (row.reply_to_id) {
          const rp = await pool.query(
            `SELECT m.content, u.username
             FROM messages m
             JOIN users u ON u.id = m.user_id
             WHERE m.id = $1`,
            [row.reply_to_id]
          );
          if (rp.rows.length) {
            replyPreviewContent = rp.rows[0].content;
            replyPreviewUsername = rp.rows[0].username;
          }
        }
        const message = {
          ...sanitizeImageUrlField({
            ...row,
            username: row.username,
            avatar_url: row.avatar_url ? sanitizeMediaUrl(row.avatar_url) : null,
          }),
          reactions: [],
          reply_preview_content: replyPreviewContent,
          reply_preview_username: replyPreviewUsername,
        };

        io.to(`channel:${channelId}`).emit("receive_message", message);

        if (content.trim()) {
          notifyChannelMentions(io, pool, {
            serverId,
            channelId,
            messageId: message.id,
            senderId: socket.userId,
            content: content.trim(),
          }).catch(() => {});
        }

        const snippet =
          content.trim().slice(0, 80) || (imageUrl ? "Imagen" : "");
        io.to(`server:${serverId}`).emit("echonet_notification", {
          serverId,
          channelId,
          username: message.username,
          snippet,
          messageId: message.id,
        });

        appEvents.emit("message.created", {
          channelId,
          messageId: message.id,
          userId: socket.userId,
          serverId,
        });

        if (typeof ack === "function") ack({ ok: true, message });
      } catch (e) {
        logger.error({ err: e, event: "send_message", userId: socket.userId }, "send_message failed");
        if (typeof ack === "function") ack({ error: "save_failed" });
      }
    });

    socket.on("edit_message", async (payload, ack) => {
      const messageId = parseInt(payload?.message_id, 10);
      const content = typeof payload?.content === "string" ? payload.content.trim() : "";
      if (Number.isNaN(messageId) || !content) {
        if (typeof ack === "function") ack({ error: "invalid" });
        return;
      }
      if (textContainsBlockedLanguage(content, { source: "socket_edit_message", userId: socket.userId })) {
        if (typeof ack === "function") ack({ error: "blocked_content" });
        return;
      }
      try {
        const row = await pool.query(
          `SELECT id, user_id, channel_id
           FROM messages
           WHERE id = $1`,
          [messageId]
        );
        if (!row.rows.length) {
          if (typeof ack === "function") ack({ error: "not_found" });
          return;
        }
        const msg = row.rows[0];
        if (Number(msg.user_id) !== Number(socket.userId)) {
          if (typeof ack === "function") ack({ error: "forbidden" });
          return;
        }
        if (!(await canReadChannel(socket.userId, msg.channel_id))) {
          if (typeof ack === "function") ack({ error: "forbidden" });
          return;
        }
        const oldContent = String(msg.content || "");
        const updated = await pool.query(
          `WITH upd AS (
             UPDATE messages
             SET content = $2, edited_at = NOW()
             WHERE id = $1
             RETURNING *
           )
           SELECT upd.*, u.username, u.avatar_url
           FROM upd
           JOIN users u ON u.id = $3`,
          [messageId, content, socket.userId]
        );
        if (oldContent !== content) {
          await pool.query(
            `INSERT INTO message_edit_history (message_id, old_content, new_content, edited_by)
             VALUES ($1, $2, $3, $4)`,
            [messageId, oldContent, content, socket.userId]
          );
        }
        const updRow = updated.rows[0];
        const out = sanitizeImageUrlField({
          ...updRow,
          username: updRow.username,
          avatar_url: updRow.avatar_url ? sanitizeMediaUrl(updRow.avatar_url) : null,
        });
        io.to(`channel:${msg.channel_id}`).emit("message_updated", out);
        if (typeof ack === "function") ack({ ok: true, message: out });
      } catch (e) {
        logger.error({ err: e, event: "edit_message", userId: socket.userId }, "edit_message failed");
        if (typeof ack === "function") ack({ error: "save_failed" });
      }
    });

    socket.on("direct_typing", async (payload) => {
      const conversationId = parseInt(payload?.conversation_id, 10);
      if (Number.isNaN(conversationId)) return;
      const allowed = await pool.query(
        `SELECT 1 FROM direct_conversations
         WHERE id = $1 AND (user_low_id = $2 OR user_high_id = $2)`,
        [conversationId, socket.userId]
      );
      if (!allowed.rows.length) return;
      const typing = payload?.typing !== false;
      if (typing) {
        const key = `${socket.userId}:${conversationId}`;
        const now = Date.now();
        const last = directTypingLastEmit.get(key) || 0;
        if (now - last < 2000) return;
        directTypingLastEmit.set(key, now);
      }
      const u = await pool.query("SELECT username FROM users WHERE id = $1", [socket.userId]);
      socket.to(`dm:${conversationId}`).emit("direct_typing", {
        conversation_id: conversationId,
        user_id: socket.userId,
        username: u.rows[0]?.username || `user_${socket.userId}`,
        typing,
      });
    });

    socket.on("delete_message", async (payload, ack) => {
      const messageId = parseInt(payload?.message_id, 10);
      if (Number.isNaN(messageId)) {
        if (typeof ack === "function") ack({ error: "invalid" });
        return;
      }
      const row = await pool.query(
        `SELECT id, user_id, channel_id
         FROM messages
         WHERE id = $1`,
        [messageId]
      );
      if (!row.rows.length) {
        if (typeof ack === "function") ack({ error: "not_found" });
        return;
      }
      const msg = row.rows[0];
      if (!(await canReadChannel(socket.userId, msg.channel_id))) {
        if (typeof ack === "function") ack({ error: "forbidden" });
        return;
      }
      const serverId = await getChannelServerId(msg.channel_id);
      const canManage = serverId ? await canManageChannels(socket.userId, serverId) : false;
      const isOwner = Number(msg.user_id) === Number(socket.userId);
      if (!isOwner && !canManage) {
        if (typeof ack === "function") ack({ error: "forbidden" });
        return;
      }
      await pool.query("DELETE FROM messages WHERE id = $1", [messageId]);
      if (canManage && !isOwner) {
        await logAdminAction({
          actorUserId: socket.userId,
          action: "message_delete_moderation",
          targetMessageId: Number(messageId),
          channelId: Number(msg.channel_id),
          serverId: serverId ? Number(serverId) : null,
          metadata: { owner_user_id: Number(msg.user_id) },
        });
      }
      io.to(`channel:${msg.channel_id}`).emit("message_deleted", { id: messageId, channel_id: msg.channel_id });
      if (typeof ack === "function") ack({ ok: true, id: messageId });
    });

    socket.on("pin_message", async (payload, ack) => {
      const messageId = parseInt(payload?.message_id, 10);
      const pin = payload?.pin !== false;
      if (Number.isNaN(messageId)) {
        if (typeof ack === "function") ack({ error: "invalid" });
        return;
      }
      const row = await pool.query(
        `SELECT m.id, m.channel_id, u.username
         FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.id = $1`,
        [messageId]
      );
      if (!row.rows.length) {
        if (typeof ack === "function") ack({ error: "not_found" });
        return;
      }
      const msg = row.rows[0];
      const serverId = await getChannelServerId(msg.channel_id);
      if (!serverId || !(await canManageChannels(socket.userId, serverId))) {
        if (typeof ack === "function") ack({ error: "forbidden" });
        return;
      }
      const updated = await pool.query(
        `UPDATE messages
         SET is_pinned = $2,
             pinned_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
             pinned_by = CASE WHEN $2 THEN $3::int ELSE NULL END
         WHERE id = $1
         RETURNING *`,
        [messageId, pin, socket.userId]
      );
      io.to(`channel:${msg.channel_id}`).emit("message_updated", {
        ...updated.rows[0],
        username: msg.username,
      });
      await logAdminAction({
        actorUserId: socket.userId,
        action: pin ? "message_pin" : "message_unpin",
        targetMessageId: Number(messageId),
        channelId: Number(msg.channel_id),
        serverId: Number(serverId),
      });
      if (typeof ack === "function") ack({ ok: true, message: updated.rows[0] });
    });

    socket.on("react_message", async (payload, ack) => {
      try {
        const messageId = parseInt(payload?.message_id, 10);
        const reactionKey = String(payload?.reaction_key || "").trim();
        const active = payload?.active !== false;
        if (Number.isNaN(messageId) || !reactionKey || reactionKey.length > 32) {
          if (typeof ack === "function") ack({ error: "invalid" });
          return;
        }
        const row = await pool.query(
          `SELECT id, channel_id
           FROM messages
           WHERE id = $1`,
          [messageId]
        );
        if (!row.rows.length) {
          if (typeof ack === "function") ack({ error: "not_found" });
          return;
        }
        const channelId = row.rows[0].channel_id;
        if (!(await canReadChannel(socket.userId, channelId))) {
          if (typeof ack === "function") ack({ error: "forbidden" });
          return;
        }
        if (active) {
          await pool.query(
            `INSERT INTO message_reactions (message_id, user_id, reaction_key)
             VALUES ($1, $2, $3)
             ON CONFLICT (message_id, user_id, reaction_key) DO NOTHING`,
            [messageId, socket.userId, reactionKey]
          );
        } else {
          await pool.query(
            `DELETE FROM message_reactions
             WHERE message_id = $1 AND user_id = $2 AND reaction_key = $3`,
            [messageId, socket.userId, reactionKey]
          );
        }
        const reactions = await getMessageReactions(messageId, socket.userId);
        io.to(`channel:${channelId}`).emit("message_reactions_updated", {
          message_id: messageId,
          channel_id: channelId,
          reactions,
        });
        if (typeof ack === "function") ack({ ok: true, reactions });
      } catch (error) {
        logger.error({ err: error, event: "react_message", userId: socket.userId }, "react_message failed");
        if (typeof ack === "function") ack({ error: "save_failed" });
      }
    });

    socket.on("join_direct_conversation", async (conversationId, cb) => {
      const id = parseInt(conversationId, 10);
      if (Number.isNaN(id)) {
        if (typeof cb === "function") cb({ error: "invalid" });
        return;
      }
      const allowed = await pool.query(
        `SELECT 1 FROM direct_conversations
         WHERE id = $1 AND (user_low_id = $2 OR user_high_id = $2)`,
        [id, socket.userId]
      );
      if (!allowed.rows.length) {
        if (typeof cb === "function") cb({ error: "forbidden" });
        return;
      }
      socket.join(`dm:${id}`);
      if (typeof cb === "function") cb({ ok: true });
    });

    socket.on("leave_direct_conversation", (conversationId) => {
      const id = parseInt(conversationId, 10);
      if (!Number.isNaN(id)) socket.leave(`dm:${id}`);
    });

    socket.on("send_direct_message", async (payload, ack) => {
      if (!canPassRateLimit(socket.userId, "direct_message", directMessageLimitPerWindow)) {
        if (typeof ack === "function") ack({ error: "rate_limited" });
        return;
      }
      const conversationId = parseInt(payload?.conversation_id, 10);
      const content = String(payload?.content || "").trim();
      const imageUrl = payload?.image_url ? String(payload.image_url).trim() : null;
      if (Number.isNaN(conversationId) || (!content && !imageUrl)) {
        if (typeof ack === "function") ack({ error: "invalid" });
        return;
      }
      const conv = await pool.query(
        `SELECT id, user_low_id, user_high_id
         FROM direct_conversations
         WHERE id = $1 AND (user_low_id = $2 OR user_high_id = $2)`,
        [conversationId, socket.userId]
      );
      if (!conv.rows.length) {
        if (typeof ack === "function") ack({ error: "forbidden" });
        return;
      }
      const cRow = conv.rows[0];
      const peerDm =
        Number(cRow.user_low_id) === Number(socket.userId) ? cRow.user_high_id : cRow.user_low_id;
      if (await areUsersBlocked(socket.userId, peerDm)) {
        if (typeof ack === "function") ack({ error: "blocked" });
        return;
      }
      if (content && textContainsBlockedLanguage(content, { source: "socket_dm_message", userId: socket.userId })) {
        if (typeof ack === "function") ack({ error: "blocked_content" });
        return;
      }
      try {
        const replyToRaw = parseInt(payload?.reply_to_message_id, 10);
        let replyToId = null;
        if (!Number.isNaN(replyToRaw) && replyToRaw > 0) {
          const replyCheck = await pool.query(
            `SELECT id, conversation_id FROM direct_messages WHERE id = $1`,
            [replyToRaw]
          );
          if (
            replyCheck.rows.length &&
            Number(replyCheck.rows[0].conversation_id) === conversationId
          ) {
            replyToId = replyToRaw;
          }
        }

        const result = await pool.query(
          `WITH ins AS (
             INSERT INTO direct_messages (conversation_id, sender_id, content, image_url, reply_to_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *
           )
           SELECT ins.*, u.username, u.avatar_url
           FROM ins
           JOIN users u ON u.id = ins.sender_id`,
          [conversationId, socket.userId, content || "(imagen)", imageUrl, replyToId]
        );
        const row = result.rows[0];
        let replyPreviewContent = null;
        let replyPreviewUsername = null;
        if (row.reply_to_id) {
          const rp = await pool.query(
            `SELECT dm.content, usr.username
             FROM direct_messages dm
             JOIN users usr ON usr.id = dm.sender_id
             WHERE dm.id = $1`,
            [row.reply_to_id]
          );
          if (rp.rows.length) {
            replyPreviewContent = rp.rows[0].content;
            replyPreviewUsername = rp.rows[0].username;
          }
        }
        const message = sanitizeImageUrlField({
          ...row,
          username: row.username || `user_${socket.userId}`,
          avatar_url: row.avatar_url ? sanitizeMediaUrl(row.avatar_url) : null,
          reply_preview_content: replyPreviewContent,
          reply_preview_username: replyPreviewUsername,
        });
        io.to(`dm:${conversationId}`).emit("receive_direct_message", message);
        io.to(`user:${conv.rows[0].user_low_id}`).emit("direct_message_notification", {
          conversationId,
          message,
        });
        io.to(`user:${conv.rows[0].user_high_id}`).emit("direct_message_notification", {
          conversationId,
          message,
        });
        recordDmMessage();
        if (typeof ack === "function") ack({ ok: true, message });
      } catch (e) {
        logger.error({ err: e, event: "send_direct_message", userId: socket.userId }, "send_direct_message failed");
        if (typeof ack === "function") ack({ error: "save_failed" });
      }
    });

    socket.on("edit_direct_message", async (payload, ack) => {
      const dmMessageId = parseInt(payload?.dm_message_id, 10);
      const content = typeof payload?.content === "string" ? payload.content.trim() : "";
      if (Number.isNaN(dmMessageId) || !content) {
        if (typeof ack === "function") ack({ error: "invalid" });
        return;
      }
      if (textContainsBlockedLanguage(content, { source: "socket_edit_dm", userId: socket.userId })) {
        if (typeof ack === "function") ack({ error: "blocked_content" });
        return;
      }
      try {
        const row = await pool.query(
          `SELECT id, sender_id, conversation_id
           FROM direct_messages
           WHERE id = $1`,
          [dmMessageId]
        );
        if (!row.rows.length) {
          if (typeof ack === "function") ack({ error: "not_found" });
          return;
        }
        const msg = row.rows[0];
        if (Number(msg.sender_id) !== Number(socket.userId)) {
          if (typeof ack === "function") ack({ error: "forbidden" });
          return;
        }
        const allowed = await pool.query(
          `SELECT 1 FROM direct_conversations
           WHERE id = $1 AND (user_low_id = $2 OR user_high_id = $2)`,
          [msg.conversation_id, socket.userId]
        );
        if (!allowed.rows.length) {
          if (typeof ack === "function") ack({ error: "forbidden" });
          return;
        }
        const oldContent = String(msg.content || "");
        const updated = await pool.query(
          `WITH upd AS (
             UPDATE direct_messages
             SET content = $2, edited_at = NOW()
             WHERE id = $1
             RETURNING *
           )
           SELECT upd.*, u.username, u.avatar_url
           FROM upd
           JOIN users u ON u.id = $3`,
          [dmMessageId, content, socket.userId]
        );
        if (oldContent !== content) {
          await pool.query(
            `INSERT INTO message_edit_history (direct_message_id, old_content, new_content, edited_by)
             VALUES ($1, $2, $3, $4)`,
            [dmMessageId, oldContent, content, socket.userId]
          );
        }
        const dmUpd = updated.rows[0];
        const out = sanitizeImageUrlField({
          ...dmUpd,
          username: dmUpd.username,
          avatar_url: dmUpd.avatar_url ? sanitizeMediaUrl(dmUpd.avatar_url) : null,
        });
        io.to(`dm:${msg.conversation_id}`).emit("direct_message_updated", out);
        if (typeof ack === "function") ack({ ok: true, message: out });
      } catch (e) {
        logger.error({ err: e, event: "edit_direct_message", userId: socket.userId }, "edit_direct_message failed");
        if (typeof ack === "function") ack({ error: "save_failed" });
      }
    });

    socket.on("voice:join", async ({ channelId, username }, cb) => {
      const id = parseInt(channelId, 10);
      if (Number.isNaN(id)) {
        if (typeof cb === "function") cb({ error: "invalid" });
        return;
      }
      const perms = await getChannelPermissionsForUser(socket.userId, id);
      if (!perms.allowed || perms.channel?.type !== "voice" || !perms.can_connect) {
        if (typeof cb === "function") cb({ error: "forbidden" });
        return;
      }
      const room = getRoom(id);
      const distinctUsers = new Set(Array.from(room.values()).map((p) => p.userId));
      const isNewUser = !distinctUsers.has(socket.userId);
      const rawLimit = perms.channel?.voice_user_limit;
      const limitNum =
        rawLimit == null || rawLimit === "" ? null : Number.parseInt(String(rawLimit), 10);
      if (
        limitNum != null &&
        Number.isFinite(limitNum) &&
        limitNum > 0 &&
        isNewUser &&
        distinctUsers.size >= limitNum
      ) {
        if (typeof cb === "function") cb({ error: "voice_full" });
        return;
      }
      socket.join(`voice:${id}`);
      room.set(socket.id, {
        socketId: socket.id,
        userId: socket.userId,
        username: username || `user_${socket.userId}`,
        mic_muted: false,
        deafened: false,
      });
      const participants = await enrichVoiceParticipants(Array.from(room.values()));
      if (typeof cb === "function") cb({ ok: true, participants });
      const joinedPayload = participants.find((p) => p.socketId === socket.id) || room.get(socket.id);
      socket.to(`voice:${id}`).emit("voice:user-joined", joinedPayload);
      emitVoicePresence(id, socket).catch(() => {});
    });

    socket.on("voice:leave", ({ channelId }) => {
      const id = parseInt(channelId, 10);
      if (Number.isNaN(id)) return;
      socket.leave(`voice:${id}`);
      const room = voiceRooms.get(id);
      if (!room) return;
      room.delete(socket.id);
      io.to(`voice:${id}`).emit("voice:user-left", { socketId: socket.id });
      if (room.size === 0) voiceRooms.delete(id);
      emitVoicePresence(id, socket).catch(() => {});
    });

    socket.on("voice:signal", ({ channelId, targetSocketId, description, candidate }) => {
      const id = parseInt(channelId, 10);
      if (Number.isNaN(id) || !targetSocketId) return;
      const voiceRoom = `voice:${id}`;
      if (!socket.rooms.has(voiceRoom)) return;
      const room = io.sockets.adapter.rooms.get(voiceRoom);
      if (!room || !room.has(targetSocketId)) return;
      io.to(targetSocketId).emit("voice:signal", {
        channelId: id,
        fromSocketId: socket.id,
        description: description || null,
        candidate: candidate || null,
      });
    });

    /** Mic / sordina: sincroniza UI en lista lateral y tiles (mismo payload que voice:presence). */
    socket.on("voice:state", ({ channelId, mic_muted: micMuted, deafened: deafenedFlag }) => {
      if (!canPassRateLimit(socket.userId, "voice_state", 90)) return;
      const id = parseInt(channelId, 10);
      if (Number.isNaN(id)) return;
      const voiceRoom = `voice:${id}`;
      if (!socket.rooms.has(voiceRoom)) return;
      const room = voiceRooms.get(id);
      if (!room || !room.has(socket.id)) return;
      const cur = room.get(socket.id);
      const next = {
        ...cur,
        mic_muted: micMuted !== undefined ? Boolean(micMuted) : Boolean(cur.mic_muted),
        deafened: deafenedFlag !== undefined ? Boolean(deafenedFlag) : Boolean(cur.deafened),
      };
      room.set(socket.id, next);
      emitVoicePresence(id, null).catch(() => {});
    });

    socket.on("disconnect", () => {
      removeFromVoiceRooms(socket.id);
      clearEphemeralForUser(socket.userId);
      notifyGameActivityChange(io, socket.userId).catch(() => {});
      removeUserFromGlobalPresence(socket.userId);
      if (socket.data.joinedServers && socket.data.joinedServers.size > 0) {
        for (const sid of socket.data.joinedServers) {
          removeUserFromServerPresence(sid, socket.userId);
        }
      }
    });
  });
}

module.exports = initSocket;

module.exports.getVoicePresenceSnapshotForServer = async function getVoicePresenceSnapshotForServer(serverId) {
  if (!getVoicePresenceSnapshotForServerImpl) return {};
  const sid = parseInt(serverId, 10);
  if (Number.isNaN(sid)) return {};
  return getVoicePresenceSnapshotForServerImpl(sid);
};

module.exports.getConnectedUserIdsForServer = function getConnectedUserIdsForServer(serverId) {
  if (!getConnectedUserIdsForServerImpl) return [];
  const sid = parseInt(serverId, 10);
  if (Number.isNaN(sid)) return [];
  return getConnectedUserIdsForServerImpl(sid);
};

module.exports.getConnectedUserIdsGlobal = function getConnectedUserIdsGlobal() {
  if (!getConnectedUserIdsGlobalImpl) return [];
  return getConnectedUserIdsGlobalImpl();
};
