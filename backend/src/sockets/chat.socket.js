const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const { canAccessChannel, getChannelServerId } = require("../lib/membership");

function initSocket(io) {
  const secret = process.env.JWT_SECRET || "dev-secret-change-me";

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
      const ok = await canAccessChannel(socket.userId, id);
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
      const ok = await canAccessChannel(socket.userId, channelId);
      if (!ok) {
        if (typeof ack === "function") ack({ error: "forbidden" });
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

    socket.on("disconnect", () => {});
  });
}

module.exports = initSocket;
