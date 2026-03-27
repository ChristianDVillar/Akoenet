require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const { createApp } = require("./app");
const initSocket = require("./sockets/chat.socket");
const logger = require("./lib/logger");

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

async function configureRedisAdapterIfNeeded() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    app.locals.redisEnabled = false;
    app.locals.redisClient = null;
    return;
  }
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  await pubClient.connect();
  await subClient.connect();
  io.adapter(createAdapter(pubClient, subClient));
  app.locals.redisEnabled = true;
  app.locals.redisClient = pubClient;
  logger.info("Socket.IO Redis adapter enabled");
}

const port = parseInt(process.env.PORT || "3000", 10);

configureRedisAdapterIfNeeded()
  .then(() => {
    initSocket(io);
    server.listen(port, () => {
      logger.info(`AkoNet backend on port ${port} (AkoNet socket ready, Twitch ready)`);
    });
  })
  .catch((e) => {
    logger.error({ err: e }, "Startup failed");
    process.exit(1);
  });
