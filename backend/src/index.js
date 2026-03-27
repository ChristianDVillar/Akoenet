require("dotenv").config();
const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const authRoutes = require("./routes/auth.routes");
const serverRoutes = require("./routes/server.routes");
const channelRoutes = require("./routes/channel.routes");
const messageRoutes = require("./routes/message.routes");
const uploadRoutes = require("./routes/upload.routes");
const dmRoutes = require("./routes/dm.routes");
const initSocket = require("./sockets/chat.socket");
const pool = require("./config/db");

const app = express();
const uploadDir = path.join(__dirname, "..", "uploads");

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use("/uploads", express.static(uploadDir));

const twitchClientId = process.env.TWITCH_CLIENT_ID || "yecj656il7pktuhi3ts2frpz9j0gwv";

app.get("/health", (_req, res) =>
  res.json({ ok: true, product: "AkoNet", chat: "AkoNet", twitchClientId })
);

app.use("/auth", authRoutes);
app.use("/servers", serverRoutes);
app.use("/channels", channelRoutes);
app.use("/messages", messageRoutes);
app.use("/upload", uploadRoutes);
app.use("/dm", dmRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

initSocket(io);

async function ensureSchema() {
  await pool.query(`
    ALTER TABLE servers
    ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS channel_categories (
      id SERIAL PRIMARY KEY,
      server_id INT NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS category_id INT REFERENCES channel_categories (id) ON DELETE SET NULL;
  `);
  await pool.query(`
    ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_channels_category ON channels (category_id);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS channel_permissions (
      channel_id INT NOT NULL REFERENCES channels (id) ON DELETE CASCADE,
      role_id INT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
      can_view BOOLEAN NOT NULL DEFAULT true,
      can_send BOOLEAN NOT NULL DEFAULT true,
      can_connect BOOLEAN NOT NULL DEFAULT true,
      PRIMARY KEY (channel_id, role_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS channel_user_permissions (
      channel_id INT NOT NULL REFERENCES channels (id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      can_view BOOLEAN NOT NULL DEFAULT true,
      can_send BOOLEAN NOT NULL DEFAULT true,
      can_connect BOOLEAN NOT NULL DEFAULT true,
      PRIMARY KEY (channel_id, user_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS direct_conversations (
      id SERIAL PRIMARY KEY,
      user_low_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      user_high_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_low_id, user_high_id),
      CHECK (user_low_id < user_high_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id SERIAL PRIMARY KEY,
      conversation_id INT NOT NULL REFERENCES direct_conversations (id) ON DELETE CASCADE,
      sender_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE direct_messages
    ADD COLUMN IF NOT EXISTS image_url TEXT;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation
    ON direct_messages (conversation_id, created_at DESC);
  `);
}

const port = parseInt(process.env.PORT || "3000", 10);
ensureSchema()
  .then(() => {
    server.listen(port, () => {
      console.log(`AkoNet backend on port ${port} (AkoNet socket ready, Twitch ready)`);
    });
  })
  .catch((e) => {
    console.error("Schema init failed", e);
    process.exit(1);
  });
