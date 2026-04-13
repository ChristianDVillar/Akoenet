require("./load-env");
const http = require("http");
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const { createApp } = require("./app");
const { registerDomainHandlers } = require("./lib/register-domain-handlers");

registerDomainHandlers();
const initSocket = require("./sockets/chat.socket");
const logger = require("./lib/logger");
const { dakinisCopyrightNotice } = require("./lib/copyright");
const { appEvents } = require("./lib/app-events");
const { recordChannelMessage } = require("./lib/runtime-metrics");

appEvents.on("message.created", () => {
  recordChannelMessage();
});

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});
app.locals.io = io;

async function configureRedisAdapterIfNeeded() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    app.locals.redisEnabled = false;
    app.locals.redisClient = null;
    return;
  }
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  try {
    await pubClient.connect();
    await subClient.connect();
  } catch (err) {
    await Promise.allSettled([pubClient.quit().catch(() => {}), subClient.quit().catch(() => {})]);
    logger.warn(
      { err },
      "Redis no disponible: Socket.IO sin adapter (un solo proceso). Arranca Redis o borra REDIS_URL en .env."
    );
    app.locals.redisEnabled = false;
    app.locals.redisClient = null;
    return;
  }
  io.adapter(createAdapter(pubClient, subClient));
  app.locals.redisEnabled = true;
  app.locals.redisClient = pubClient;
  logger.info("Socket.IO Redis adapter enabled");
}

const port = parseInt(process.env.PORT || "3000", 10);

configureRedisAdapterIfNeeded()
  .then(() => {
    initSocket(io);
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        logger.error(
          { err, port },
          `Puerto ${port} en uso. Cierra el otro proceso (otra terminal, Docker) o pon PORT=3001 en backend/.env y VITE_API_URL en el frontend.`
        );
      } else {
        logger.error({ err }, "HTTP server error");
      }
      process.exit(1);
    });
    server.listen(port, () => {
      logger.info(
        { port, copyright: dakinisCopyrightNotice() },
        `AkoeNet backend on port ${port} (socket ready; Twitch; Steam when STEAM_WEB_API_KEY is set)`
      );
    });
  })
  .catch((e) => {
    logger.error({ err: e }, "Startup failed");
    process.exit(1);
  });
