const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const {
  canReadChannel,
  canSendToChannel,
  getChannelPermissionsForUser,
  getChannelServerId,
} = require("../lib/membership");

function initSocket(io) {
  const secret = process.env.JWT_SECRET || "dev-secret-change-me";
  const voiceRooms = new Map();

  function getRoom(channelId) {
    if (!voiceRooms.has(channelId)) {
      voiceRooms.set(channelId, new Map());
    }
    return voiceRooms.get(channelId);
  }

  function removeFromVoiceRooms(socketId) {
    for (const [channelId, room] of voiceRooms.entries()) {
      if (room.has(socketId)) {
        room.delete(socketId);
        io.to(`voice:${channelId}`).emit("voice:user-left", { socketId });
        if (room.size === 0) voiceRooms.delete(channelId);
      }
    }
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("unauthorized"));
    }
    try {
      const decoded = jwt.verify(token, secret);
      socket.userId = decoded.id;
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

    socket.on("send_message", async (payload, ack) => {
      const channelId = parseInt(payload?.channel_id, 10);
      const content = typeof payload?.content === "string" ? payload.content : "";
      const imageUrl = payload?.image_url || null;
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

        if (typeof ack === "function") ack({ ok: true, message });
      } catch (e) {
        console.error(e);
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
      socket.join(`voice:${id}`);
      const room = getRoom(id);
      room.set(socket.id, {
        socketId: socket.id,
        userId: socket.userId,
        username: username || `user_${socket.userId}`,
      });
      const participants = Array.from(room.values());
      if (typeof cb === "function") cb({ ok: true, participants });
      socket.to(`voice:${id}`).emit("voice:user-joined", room.get(socket.id));
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
