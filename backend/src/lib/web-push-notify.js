let configured;

function ensureWebPush() {
  if (configured !== undefined) return configured;
  const pub = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const priv = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.VAPID_SUBJECT || "mailto:support@example.com").trim();
  if (!pub || !priv) {
    configured = false;
    return false;
  }
  try {
    // eslint-disable-next-line global-require
    const webpush = require("web-push");
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
    return true;
  } catch {
    configured = false;
    return false;
  }
}

const pool = require("../config/db");

/**
 * @param {number[]} userIds
 * @param {{ title: string, body: string, url?: string }} payload
 */
async function sendPushToUsers(userIds, payload) {
  if (!ensureWebPush() || !userIds?.length) return;
  // eslint-disable-next-line global-require
  const webpush = require("web-push");
  const unique = [...new Set(userIds.map(Number).filter((n) => n > 0))];
  const bodyStr = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/",
  });

  for (const uid of unique) {
    let subs;
    try {
      subs = await pool.query(
        `SELECT ps.endpoint, ps.p256dh, ps.auth, u.push_notifications_enabled
         FROM push_subscriptions ps
         JOIN users u ON u.id = ps.user_id
         WHERE ps.user_id = $1`,
        [uid]
      );
    } catch {
      continue;
    }
    for (const row of subs.rows) {
      if (row.push_notifications_enabled === false) continue;
      const subscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(subscription, bodyStr, {
          TTL: 60,
          urgency: "normal",
        });
      } catch {
        /* invalid subscription — could delete */
      }
    }
  }
}

module.exports = { sendPushToUsers, ensureWebPush };
