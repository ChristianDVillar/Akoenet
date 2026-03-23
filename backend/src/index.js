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
const initSocket = require("./sockets/chat.socket");

const app = express();
const uploadDir = path.join(__dirname, "..", "uploads");

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use("/uploads", express.static(uploadDir));

app.get("/health", (_req, res) => res.json({ ok: true, product: "Nexora", chat: "EchoNet" }));

app.use("/auth", authRoutes);
app.use("/servers", serverRoutes);
app.use("/channels", channelRoutes);
app.use("/messages", messageRoutes);
app.use("/upload", uploadRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

initSocket(io);

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, () => {
  console.log(`Nexora backend on port ${port} (EchoNet socket ready)`);
});
