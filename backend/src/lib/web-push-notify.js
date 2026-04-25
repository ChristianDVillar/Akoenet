let configured;
let firebaseConfigured;
let firebaseMessaging;

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

function ensureFirebaseMessaging() {
  if (firebaseConfigured !== undefined) return firebaseConfigured ? firebaseMessaging : null;
  const serviceAccountRaw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!serviceAccountRaw) {
    firebaseConfigured = false;
    return null;
  }
  try {
    const admin = require("firebase-admin");
    const creds = JSON.parse(serviceAccountRaw);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(creds),
      });
    }
    firebaseMessaging = admin.messaging();
    firebaseConfigured = true;
    return firebaseMessaging;
  } catch {
    firebaseConfigured = false;
    firebaseMessaging = null;
    return null;
  }
}

function isFirebaseConfigured() {
  return Boolean(ensureFirebaseMessaging());
}

function isWebPushConfigured() {
  return Boolean(ensureWebPush());
}

async function getPushDeliveryDebug() {
  const webConfigured = isWebPushConfigured();
  const firebaseOk = isFirebaseConfigured();
  const rows = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE subscription_type = 'web')::int AS web_total,
       COUNT(*) FILTER (WHERE subscription_type = 'native')::int AS native_total,
       COUNT(*) FILTER (WHERE subscription_type = 'native' AND native_platform = 'android')::int AS native_android_total,
       COUNT(*) FILTER (WHERE subscription_type = 'native' AND native_platform = 'ios')::int AS native_ios_total
     FROM push_subscriptions`
  );
  const byUser = await pool.query(
    `SELECT
       COUNT(DISTINCT user_id)::int AS users_with_any,
       COUNT(DISTINCT CASE WHEN subscription_type = 'native' AND native_platform = 'android' THEN user_id END)::int AS users_with_android_native
     FROM push_subscriptions`
  );
  const r = rows.rows[0] || {};
  const u = byUser.rows[0] || {};
  return {
    configured: {
      web_push_vapid: webConfigured,
      android_fcm: firebaseOk,
    },
    subscriptions: {
      total: Number(r.total || 0),
      web_total: Number(r.web_total || 0),
      native_total: Number(r.native_total || 0),
      native_android_total: Number(r.native_android_total || 0),
      native_ios_total: Number(r.native_ios_total || 0),
    },
    users: {
      with_any_push: Number(u.users_with_any || 0),
      with_android_native: Number(u.users_with_android_native || 0),
    },
  };
}

/**
 * @param {number[]} userIds
 * @param {{ title: string, body: string, url?: string }} payload
 */
async function sendPushToUsers(userIds, payload) {
  if (!userIds?.length) return;
  const unique = [...new Set(userIds.map(Number).filter((n) => n > 0))];
  if (!unique.length) return;
  const bodyStr = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/",
  });
  if (ensureWebPush()) {
    const webpush = require("web-push");

    for (const uid of unique) {
      let subs;
      try {
        subs = await pool.query(
          `SELECT ps.endpoint, ps.p256dh, ps.auth, u.push_notifications_enabled
           FROM push_subscriptions ps
           JOIN users u ON u.id = ps.user_id
           WHERE ps.user_id = $1
             AND ps.subscription_type = 'web'`,
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

  const messaging = ensureFirebaseMessaging();
  if (!messaging) return;

  try {
    const nativeRes = await pool.query(
      `SELECT id, native_token
       FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       WHERE ps.user_id = ANY($1::bigint[])
         AND ps.subscription_type = 'native'
         AND ps.native_platform = 'android'
         AND ps.native_token IS NOT NULL
         AND COALESCE(u.push_notifications_enabled, true) = true`,
      [unique]
    );
    const tokens = nativeRes.rows.map((r) => String(r.native_token || "").trim()).filter(Boolean);
    if (!tokens.length) return;
    const idByToken = new Map(
      nativeRes.rows.map((r) => [String(r.native_token || "").trim(), Number(r.id)]).filter((p) => p[0])
    );
    const batchSize = 500;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      try {
        const resp = await messaging.sendEachForMulticast({
          tokens: batch,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: {
            url: String(payload.url || "/"),
          },
          android: {
            priority: "high",
            ttl: 60 * 1000,
          },
        });
        const staleIds = [];
        resp.responses.forEach((r, idx) => {
          if (r.success) return;
          const code = String(r.error?.code || "");
          if (
            code.includes("registration-token-not-registered") ||
            code.includes("invalid-registration-token")
          ) {
            const token = batch[idx];
            const rowId = idByToken.get(token);
            if (rowId) staleIds.push(rowId);
          }
        });
        if (staleIds.length) {
          await pool.query(`DELETE FROM push_subscriptions WHERE id = ANY($1::bigint[])`, [staleIds]);
        }
      } catch {
        /* ignore native push batch errors */
      }
    }
  } catch {
    /* ignore native push query errors */
  }
}

/**
 * @param {string[]} tokens
 * @param {{ title: string, body: string, url?: string }} payload
 */
async function sendPushToNativeTokens(tokens, payload) {
  const messaging = ensureFirebaseMessaging();
  if (!messaging) return { sent: 0, failed: 0 };
  const cleanTokens = [...new Set((tokens || []).map((t) => String(t || "").trim()).filter(Boolean))];
  if (!cleanTokens.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const batchSize = 500;
  for (let i = 0; i < cleanTokens.length; i += batchSize) {
    const batch = cleanTokens.slice(i, i + batchSize);
    try {
      const resp = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          url: String(payload.url || "/"),
        },
        android: {
          priority: "high",
          ttl: 60 * 1000,
        },
      });
      sent += Number(resp.successCount || 0);
      failed += Number(resp.failureCount || 0);
    } catch {
      failed += batch.length;
    }
  }
  return { sent, failed };
}

module.exports = {
  sendPushToUsers,
  sendPushToNativeTokens,
  ensureWebPush,
  ensureFirebaseMessaging,
  getPushDeliveryDebug,
};
