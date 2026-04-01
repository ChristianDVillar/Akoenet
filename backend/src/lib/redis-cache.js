const logger = require("./logger");

let client;
let connecting;

async function getClient() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (client?.isOpen) return client;
  if (connecting) {
    await connecting;
    return client?.isOpen ? client : null;
  }
  try {
    const { createClient } = require("redis");
    connecting = (async () => {
      const c = createClient({ url });
      c.on("error", () => {});
      await c.connect();
      client = c;
    })();
    await connecting;
    connecting = null;
    return client;
  } catch (e) {
    connecting = null;
    logger.warn({ err: e }, "Redis cache: connection failed");
    return null;
  }
}

/**
 * @param {string} key
 * @returns {Promise<string | null>}
 */
async function cacheGet(key) {
  const c = await getClient();
  if (!c) return null;
  try {
    return await c.get(key);
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {string} value
 * @param {number} ttlSeconds
 */
async function cacheSet(key, value, ttlSeconds) {
  const c = await getClient();
  if (!c) return;
  try {
    await c.set(key, value, { EX: ttlSeconds });
  } catch {
    /* ignore */
  }
}

module.exports = { cacheGet, cacheSet, getClient };
