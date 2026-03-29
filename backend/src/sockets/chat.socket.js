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
const { resolveSchedulerStreamerSlug } = require("../lib/scheduler-resolve");
const { appEvents } = require("../lib/app-events");

/** Set on first initSocket(io) — used by GET /servers/:id/voice-presence */
let getVoicePresenceSnapshotForServerImpl = null;

function initSocket(io) {
  const secret = process.env.JWT_SECRET || "dev-secret-change-me";
  const voiceRooms = new Map();
  const messageWindowMs = 60 * 1000;
  const messageLimitPerWindow = Number(process.env.SOCKET_MESSAGE_RATE_LIMIT_MAX || 40);
  const directMessageLimitPerWindow = Number(process.env.SOCKET_DM_RATE_LIMIT_MAX || 30);
  const schedulerCommandLimitPerWindow = Number(process.env.SCHEDULER_SOCKET_RATE_LIMIT_MAX || 15);
  const socketRateState = new Map();
  const typingLastEmit = new Map();

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
      if (!byUser.has(p.userId)) {
        byUser.set(p.userId, { userId: p.userId, username: p.username });
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
      return {
        userId: p.userId,
        username: db?.username ?? p.username,
        avatar_url: db?.avatar_url ?? null,
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
      socket.userId = userId;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`user:${socket.userId}`);

    socket.on("join_server", async (serverId) => {
      const id = parseInt(serverId, 10);
      if (Number.isNaN(id)) return;
      const r = await pool.query(
        "SELECT 1 FROM server_members WHERE user_id = $1 AND server_id = $2",
        [socket.userId, id]
      );
      if (r.rows.length) {
        socket.join(`server:${id}`);
        try {
          const presence = await buildVoiceSnapshotForServer(id);
          socket.emit("voice:presence_snapshot", { serverId: id, presence });
        } catch {
          /* ignore snapshot errors */
        }
      }
    });

    socket.on("leave_server", (serverId) => {
      const id = parseInt(serverId, 10);
      if (!Number.isNaN(id)) socket.leave(`server:${id}`);
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
      const u = await pool.query("SELECT username FROM users WHERE id = $1", [socket.userId]);
      const username = u.rows[0]?.username || `user_${socket.userId}`;
      socket.to(`channel:${channelId}`).emit("channel_typing", {
        channel_id: channelId,
        user_id: socket.userId,
        username,
        typing,
      });
    });

    socket.on("send_message", async (payload, ack) => {
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
      const perms = await getChannelPermissionsForUser(socket.userId, channelId);
      if (!perms.allowed) {
        if (typeof ack === "function") ack({ error: "forbidden" });
        return;
      }
      if (perms.channel?.type === "voice" && !perms.can_connect) {
        if (typeof ack === "function") ack({ error: "voice_forbidden" });
        return;
      }
      if (perms.channel?.type !== "voice" && !(await canSendToChannel(socket.userId, channelId))) {
        if (typeof ack === "function") ack({ error: "send_forbidden" });
        return;
      }

      const serverId = await getChannelServerId(channelId);
      try {
        if (schCmd) {
          const result = await pool.query(
            `INSERT INTO messages (channel_id, user_id, content, image_url)
             VALUES ($1, $2, $3, NULL)
             RETURNING *`,
            [channelId, socket.userId, content.trim()]
          );
          const row = result.rows[0];
          const u = await pool.query("SELECT username FROM users WHERE id = $1", [socket.userId]);
          const userMessage = { ...row, username: u.rows[0]?.username, reactions: [] };
          io.to(`channel:${channelId}`).emit("receive_message", userMessage);
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

        const result = await pool.query(
          `INSERT INTO messages (channel_id, user_id, content, image_url)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [channelId, socket.userId, content.trim() || "(imagen)", imageUrl]
        );
        const row = result.rows[0];
        const u = await pool.query("SELECT username FROM users WHERE id = $1", [
          socket.userId,
        ]);
        const message = { ...row, username: u.rows[0]?.username };
        message.reactions = [];

        io.to(`channel:${channelId}`).emit("receive_message", message);

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
        console.error(e);
        if (typeof ack === "function") ack({ error: "save_failed" });
      }
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
        console.error("react_message failed", error);
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
      try {
        const result = await pool.query(
          `INSERT INTO direct_messages (conversation_id, sender_id, content, image_url)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [conversationId, socket.userId, content || "(imagen)", imageUrl]
        );
        const row = result.rows[0];
        const u = await pool.query("SELECT username FROM users WHERE id = $1", [socket.userId]);
        const message = {
          ...row,
          username: u.rows[0]?.username || `user_${socket.userId}`,
        };
        io.to(`dm:${conversationId}`).emit("receive_direct_message", message);
        io.to(`user:${conv.rows[0].user_low_id}`).emit("direct_message_notification", {
          conversationId,
          message,
        });
        io.to(`user:${conv.rows[0].user_high_id}`).emit("direct_message_notification", {
          conversationId,
          message,
        });
        if (typeof ack === "function") ack({ ok: true, message });
      } catch (e) {
        console.error(e);
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
      });
      const participants = Array.from(room.values());
      if (typeof cb === "function") cb({ ok: true, participants });
      socket.to(`voice:${id}`).emit("voice:user-joined", room.get(socket.id));
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
      io.to(targetSocketId).emit("voice:signal", {
        channelId: id,
        fromSocketId: socket.id,
        description: description || null,
        candidate: candidate || null,
      });
    });

    socket.on("disconnect", () => {
      removeFromVoiceRooms(socket.id);
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
