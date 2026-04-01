const crypto = require("crypto");
const pool = require("../config/db");
const logger = require("./logger");

/**
 * @param {{ channelId: number, messageId: number, serverId: number }} payload
 */
async function deliverMessageWebhooks(payload) {
  if (!payload?.serverId || !payload?.messageId) return;
  let hooks;
  try {
    hooks = await pool.query(`SELECT id, url, secret, event_types FROM server_webhooks WHERE server_id = $1`, [
      payload.serverId,
    ]);
  } catch (e) {
    return;
  }
  if (!hooks.rows.length) return;

  const msg = await pool.query(
    `SELECT m.id, m.channel_id, m.content, m.created_at, m.user_id, u.username
     FROM messages m
     JOIN users u ON u.id = m.user_id
     WHERE m.id = $1`,
    [payload.messageId]
  );
  if (!msg.rows.length) return;
  const m = msg.rows[0];

  const bodyObj = {
    event: "message.create",
    server_id: payload.serverId,
    message: {
      id: m.id,
      channel_id: m.channel_id,
      user_id: m.user_id,
      username: m.username,
      content: m.content,
      created_at: m.created_at,
    },
  };
  const body = JSON.stringify(bodyObj);

  for (const h of hooks.rows) {
    const types = Array.isArray(h.event_types) ? h.event_types : [];
    if (!types.includes("message.create")) continue;
    const sig = crypto.createHmac("sha256", h.secret).update(body).digest("hex");
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 8000);
      await fetch(String(h.url).trim(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "AkoeNet-Webhooks/1.0",
          "X-AkoeNet-Signature": `sha256=${sig}`,
          "X-AkoeNet-Event": "message.create",
        },
        body,
        signal: ac.signal,
      }).finally(() => clearTimeout(t));
    } catch (e) {
      logger.warn({ err: e, webhookId: h.id }, "webhook delivery failed");
    }
  }
}

module.exports = { deliverMessageWebhooks };
