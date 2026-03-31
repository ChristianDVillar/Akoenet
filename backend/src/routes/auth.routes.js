const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { z } = require("zod");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { authRateLimiter, userDataRateLimiter } = require("../middleware/rate-limit");
const logger = require("../lib/logger");
const { sanitizeUserMediaFields } = require("../lib/sanitize-media-url");
const { getJwtSecret } = require("../lib/jwt-secret");
const { assertContentAllowed, BLOCKED_MESSAGE } = require("../lib/blocked-content");

const router = express.Router();
const secret = getJwtSecret();
const tokenVersion = parseInt(process.env.TOKEN_VERSION || "2", 10);
const twitchClientId = process.env.TWITCH_CLIENT_ID || "";
const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET || "";

function stripTrailingSlash(s) {
  return String(s || "").replace(/\/$/, "");
}

function isLocalhostUrl(u) {
  if (!u || typeof u !== "string") return false;
  try {
    const h = new URL(u).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return false;
  }
}

const renderExternalUrl = stripTrailingSlash(process.env.RENDER_EXTERNAL_URL || "");
const onHostedRender = Boolean(renderExternalUrl || process.env.RENDER === "true");

/**
 * Public API origin for OAuth redirect_uri. On Render, never let a copied
 * PUBLIC_API_URL=http://localhost:* win over RENDER_EXTERNAL_URL (common footgun).
 */
function resolvePublicApiBase() {
  const explicit = stripTrailingSlash(process.env.PUBLIC_API_URL || "");
  if (explicit && !(onHostedRender && isLocalhostUrl(explicit))) {
    return explicit;
  }
  if (renderExternalUrl) return renderExternalUrl;
  if (explicit) return explicit;
  return "http://localhost:3000";
}

const publicApiBase = resolvePublicApiBase();

const defaultFrontendBase =
  process.env.RENDER === "true" ? "https://akoenet-frontend.onrender.com" : "http://localhost:5173";

function resolveFrontendBase() {
  const raw = stripTrailingSlash(process.env.FRONTEND_URL || "");
  if (raw && !(onHostedRender && isLocalhostUrl(raw))) {
    return raw;
  }
  return stripTrailingSlash(defaultFrontendBase);
}

const frontendBase = resolveFrontendBase();

/** Twitch OAuth redirect: must match Twitch Developer Console exactly (HTTPS on Render). */
const twitchRedirectUri = (() => {
  const override = stripTrailingSlash(process.env.TWITCH_REDIRECT_URI || "");
  if (override && !(onHostedRender && isLocalhostUrl(override))) {
    return override;
  }
  return `${publicApiBase}/auth/twitch/callback`;
})();

/**
 * After Twitch, redirect to SPA root with query params. Deep links like /auth/twitch/callback
 * return 404 on many static hosts (including Render) unless a /* → /index.html rewrite is set.
 * / always serves index.html, so this works without dashboard rules.
 */
function twitchOAuthSuccessUrl(appToken) {
  const u = new URL("/", frontendBase);
  u.searchParams.set("twitch_token", appToken);
  return u.toString();
}

function twitchOAuthErrorUrl(code) {
  const u = new URL("/", frontendBase);
  u.searchParams.set("twitch_error", code);
  return u.toString();
}

/** Base URL shown in /auth/twitch/status (OAuth returns ?twitch_token= or ?twitch_error= on /). */
const frontendOAuthRedirect = new URL("/", frontendBase).href;

function signAppToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      is_admin: Boolean(user.is_admin),
      token_version: tokenVersion,
    },
    secret,
    {
      expiresIn: "7d",
    }
  );
}

function getTwitchEmail(twitchId) {
  return `twitch_${twitchId}@twitch.local`;
}

function computeAgeFromBirthDateUtc(birthDateStr) {
  const d = new Date(`${birthDateStr}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

const registerSchema = z
  .object({
    username: z.string().trim().min(2).max(40),
    email: z.string().trim().email().max(120),
    password: z.string().min(6).max(200),
    birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "birth_date must be YYYY-MM-DD"),
  })
  .refine(
    (data) => {
      const age = computeAgeFromBirthDateUtc(data.birth_date);
      if (age === null) return false;
      return age >= 0 && age <= 120;
    },
    { message: "Invalid birth date", path: ["birth_date"] }
  )
  .refine(
    (data) => {
      const age = computeAgeFromBirthDateUtc(data.birth_date);
      return age != null && age >= 13;
    },
    { message: "You must be at least 13 years old to register.", path: ["birth_date"] }
  );

const loginSchema = z.object({
  email: z.string().trim().email().max(120),
  password: z.string().min(1).max(200),
});
const emptyToNull = (v) => (v === "" ? null : v);

const updateSettingsSchema = z
  .object({
    username: z.string().trim().min(2).max(40).optional(),
    avatar_url: z.preprocess(
      emptyToNull,
      z.string().trim().url().max(2000).nullable().optional()
    ),
    banner_url: z.preprocess(
      emptyToNull,
      z.string().trim().url().max(2000).nullable().optional()
    ),
    accent_color: z.preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .regex(/^#([0-9a-fA-F]{6})$/, "accent_color must be #RRGGBB")
        .nullable()
        .optional()
    ),
    bio: z.preprocess(emptyToNull, z.string().trim().max(240).nullable().optional()),
    presence_status: z.enum(["online", "idle", "dnd", "invisible"]).optional(),
    custom_status: z.preprocess(
      emptyToNull,
      z.string().trim().max(120).nullable().optional()
    ),
    /** Streamer Scheduler public slug if it differs from Twitch login (see User settings). */
    scheduler_streamer_username: z.preprocess(
      emptyToNull,
      z.union([z.string().trim().min(1).max(80), z.null()]).optional()
    ),
    current_password: z.string().min(1).max(200).optional(),
    new_password: z.string().min(6).max(200).optional(),
  })
  .refine(
    (v) => {
      if (v.new_password) return Boolean(v.current_password);
      return true;
    },
    { message: "current_password is required to set new_password", path: ["current_password"] }
  );

const eraseAccountSchema = z.object({
  reason: z.string().trim().max(240).optional(),
});

router.post("/register", authRateLimiter, validate({ body: registerSchema }), async (req, res) => {
  try {
    const { username, email, password, birth_date: birthDate } = req.body;
    if (!assertContentAllowed(username, { source: "register_username" }).ok) {
      return res.status(400).json({ error: "blocked_content", message: BLOCKED_MESSAGE });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password, birth_date, age_verified_at)
       VALUES ($1, $2, $3, $4::date, NOW())
       RETURNING id, username, email, created_at`,
      [username, email, hash, birthDate]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }
    logger.error({ err: e }, "Register failed");
    res.status(500).json({ error: "Register failed" });
  }
});

router.post("/login", authRateLimiter, validate({ body: loginSchema }), async (req, res) => {
  try {
    const { email, password } = req.body;
    const emailNorm = String(email).trim().toLowerCase();
    const result = await pool.query(
      `SELECT * FROM users
       WHERE LOWER(TRIM(email)) = $1
         AND deleted_at IS NULL`,
      [emailNorm]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const user = result.rows[0];
    if (!user.password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = signAppToken(user);
    res.json({
      token,
      user: sanitizeUserMediaFields({
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
        banner_url: user.banner_url,
        accent_color: user.accent_color,
        bio: user.bio,
        presence_status: user.presence_status,
        custom_status: user.custom_status,
        is_admin: Boolean(user.is_admin),
        twitch_username: user.twitch_username ?? null,
      }),
    });
  } catch (e) {
    logger.error({ err: e }, "Login failed");
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/twitch/start", authRateLimiter, (req, res) => {
  if (!twitchClientId || !twitchClientSecret) {
    return res.status(503).json({
      error: "Twitch OAuth not configured on server",
      code: "TWITCH_OAUTH_NOT_CONFIGURED",
      hint: "Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in the backend environment. Set FRONTEND_URL to your SPA origin. Register the backend callback in Twitch (same as TWITCH_REDIRECT_URI or {PUBLIC_API_URL|RENDER_EXTERNAL_URL}/auth/twitch/callback). The app returns to /?twitch_token= on the SPA.",
      checks: {
        clientId: Boolean(twitchClientId),
        clientSecret: Boolean(twitchClientSecret),
      },
      redirectUri: twitchRedirectUri,
      frontendRedirect: frontendOAuthRedirect,
      statusPath: "/auth/twitch/status",
    });
  }
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = jwt.sign({ nonce }, secret, { expiresIn: "10m" });
  const qs = new URLSearchParams({
    client_id: twitchClientId,
    redirect_uri: twitchRedirectUri,
    response_type: "code",
    scope: "",
    state,
  });
  return res.redirect(`https://id.twitch.tv/oauth2/authorize?${qs.toString()}`);
});

router.get("/twitch/status", (_req, res) => {
  const hasClientId = Boolean(twitchClientId);
  const hasClientSecret = Boolean(twitchClientSecret);
  const hasRedirectUri = Boolean(twitchRedirectUri);
  const hasFrontendRedirect = Boolean(frontendOAuthRedirect);

  return res.json({
    configured: hasClientId && hasClientSecret && hasRedirectUri && hasFrontendRedirect,
    checks: {
      clientId: hasClientId,
      clientSecret: hasClientSecret,
      redirectUri: hasRedirectUri,
      frontendRedirect: hasFrontendRedirect,
    },
    redirectUri: twitchRedirectUri,
    frontendRedirect: frontendOAuthRedirect,
  });
});

router.get("/twitch/callback", authRateLimiter, async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) {
    return res.redirect(twitchOAuthErrorUrl("missing_code_or_state"));
  }
  try {
    jwt.verify(String(state), secret);
  } catch {
    return res.redirect(twitchOAuthErrorUrl("invalid_state"));
  }

  try {
    const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: twitchClientId,
        client_secret: twitchClientSecret,
        code: String(code),
        grant_type: "authorization_code",
        redirect_uri: twitchRedirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      return res.redirect(twitchOAuthErrorUrl("twitch_token_failed"));
    }
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return res.redirect(twitchOAuthErrorUrl("twitch_no_access_token"));
    }

    const meRes = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": twitchClientId,
      },
    });
    if (!meRes.ok) {
      return res.redirect(twitchOAuthErrorUrl("twitch_user_failed"));
    }
    const meData = await meRes.json();
    const twitchUser = meData?.data?.[0];
    if (!twitchUser?.id || !twitchUser?.login) {
      return res.redirect(twitchOAuthErrorUrl("twitch_invalid_user"));
    }

    const email = getTwitchEmail(twitchUser.id);
    let userRes = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

    if (!userRes.rows.length) {
      const randomPass = crypto.randomBytes(24).toString("hex");
      const passHash = await bcrypt.hash(randomPass, 10);
      const login = String(twitchUser.login || "").trim().toLowerCase();
      const created = await pool.query(
        `INSERT INTO users (username, email, password, avatar_url, twitch_username)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          twitchUser.display_name || twitchUser.login,
          email,
          passHash,
          twitchUser.profile_image_url || null,
          login || null,
        ]
      );
      userRes = created;
    } else {
      const login = String(twitchUser.login || "").trim().toLowerCase();
      await pool.query(
        `UPDATE users SET username = $1, avatar_url = $2, twitch_username = $3 WHERE id = $4`,
        [
          twitchUser.display_name || twitchUser.login,
          twitchUser.profile_image_url || null,
          login || null,
          userRes.rows[0].id,
        ]
      );
      userRes = await pool.query("SELECT * FROM users WHERE id = $1", [userRes.rows[0].id]);
    }

    const user = userRes.rows[0];
    const appToken = signAppToken(user);
    return res.redirect(twitchOAuthSuccessUrl(appToken));
  } catch (e) {
    logger.error({ err: e }, "Twitch callback failed");
    return res.redirect(twitchOAuthErrorUrl("twitch_auth_failed"));
  }
});

router.get("/me", auth, async (req, res) => {
  const result = await pool.query(
    `SELECT id, username, email, avatar_url, banner_url, accent_color, bio, presence_status, custom_status, is_admin, twitch_username, scheduler_streamer_username, created_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(sanitizeUserMediaFields(result.rows[0]));
});

router.get("/me/export", auth, async (req, res) => {
  const userId = req.user.id;
  const [profileRes, serverRes, channelMessageRes, dmMessageRes] = await Promise.all([
    pool.query(
      `SELECT id, username, email, avatar_url, banner_url, accent_color, bio, presence_status, custom_status,
              twitch_username, scheduler_streamer_username, birth_date, created_at
       FROM users
       WHERE id = $1`,
      [userId]
    ),
    pool.query(
      `SELECT s.id, s.name, m.joined_at
       FROM server_members m
       JOIN servers s ON s.id = m.server_id
       WHERE m.user_id = $1
       ORDER BY m.joined_at ASC`,
      [userId]
    ),
    pool.query(
      `SELECT m.id, m.channel_id, m.content, m.image_url, m.created_at
       FROM messages m
       WHERE m.user_id = $1
       ORDER BY m.created_at ASC`,
      [userId]
    ),
    pool.query(
      `SELECT dm.id, dm.conversation_id, dm.content, dm.image_url, dm.created_at
       FROM direct_messages dm
       WHERE dm.sender_id = $1
       ORDER BY dm.created_at ASC`,
      [userId]
    ),
  ]);
  if (!profileRes.rows.length) {
    return res.status(404).json({ error: "User not found" });
  }
  const payload = {
    exported_at: new Date().toISOString(),
    user: sanitizeUserMediaFields(profileRes.rows[0]),
    memberships: serverRes.rows,
    channel_messages: channelMessageRes.rows,
    direct_messages: dmMessageRes.rows,
  };
  res.setHeader("Content-Disposition", `attachment; filename="akoenet-user-${userId}-export.json"`);
  return res.json(payload);
});

router.patch("/me", auth, userDataRateLimiter, validate({ body: updateSettingsSchema }), async (req, res) => {
  const {
    username,
    avatar_url,
    banner_url,
    accent_color,
    bio,
    presence_status: presenceStatus,
    custom_status: customStatus,
    scheduler_streamer_username: schedulerStreamerUsername,
    current_password: currentPassword,
    new_password: newPassword,
  } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT id, username, email, password, avatar_url, banner_url, accent_color, bio, presence_status, custom_status, is_admin, twitch_username, scheduler_streamer_username, created_at
       FROM users WHERE id = $1 FOR UPDATE`,
      [req.user.id]
    );
    if (!current.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found" });
    }
    const user = current.rows[0];

    if (newPassword) {
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Current password is invalid" });
      }
    }

    const nextUsername = typeof username === "string" ? username.trim() : user.username;
    const nextAvatar = avatar_url !== undefined ? avatar_url : user.avatar_url;
    const nextBanner = banner_url !== undefined ? banner_url : user.banner_url;
    const nextAccent = accent_color !== undefined ? accent_color : user.accent_color;
    const nextBio = bio !== undefined ? bio : user.bio;
    const nextPresence = presenceStatus !== undefined ? presenceStatus : user.presence_status;
    const nextCustomStatus = customStatus !== undefined ? customStatus : user.custom_status;
    const nextSchedulerSlug =
      schedulerStreamerUsername !== undefined ? schedulerStreamerUsername : user.scheduler_streamer_username;
    const nextPasswordHash = newPassword ? await bcrypt.hash(newPassword, 10) : user.password;

    const profileStrings = [nextUsername, nextBio, nextCustomStatus, nextSchedulerSlug].filter(
      (v) => v != null && String(v).trim() !== ""
    );
    for (const segment of profileStrings) {
      if (!assertContentAllowed(String(segment), { source: "patch_profile", userId: req.user.id }).ok) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "blocked_content", message: BLOCKED_MESSAGE });
      }
    }

    const updated = await client.query(
      `UPDATE users
       SET username = $2,
           avatar_url = $3,
           banner_url = $4,
           accent_color = $5,
           bio = $6,
           password = $7,
           presence_status = $8,
           custom_status = $9,
           scheduler_streamer_username = $10
       WHERE id = $1
       RETURNING id, username, email, avatar_url, banner_url, accent_color, bio, presence_status, custom_status, is_admin, twitch_username, scheduler_streamer_username, created_at`,
      [
        req.user.id,
        nextUsername,
        nextAvatar,
        nextBanner,
        nextAccent,
        nextBio,
        nextPasswordHash,
        nextPresence,
        nextCustomStatus,
        nextSchedulerSlug,
      ]
    );
    await client.query("COMMIT");
    return res.json(sanitizeUserMediaFields(updated.rows[0]));
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "23505") {
      return res.status(409).json({ error: "Username already exists" });
    }
    logger.error({ err: e }, "Update user settings failed");
    return res.status(500).json({ error: "Could not update profile settings" });
  } finally {
    client.release();
  }
});

router.delete(
  "/me",
  auth,
  userDataRateLimiter,
  validate({ body: eraseAccountSchema }),
  async (req, res) => {
    const userId = req.user.id;
    const reason = req.body.reason || null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const exists = await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!exists.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "User not found" });
      }
      const anonymizedUsername = `deleted_user_${userId}`;
      const anonymizedEmail = `deleted_user_${userId}@deleted.akoenet.local`;
      const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10);
      await client.query(
        `UPDATE users
         SET username = $2,
             email = $3,
             password = $4,
             avatar_url = NULL,
             banner_url = NULL,
             accent_color = NULL,
             bio = NULL,
             custom_status = NULL,
             presence_status = 'invisible',
             twitch_username = NULL,
             scheduler_streamer_username = NULL,
             deleted_at = NOW(),
             erased_at = NOW(),
             deletion_reason = $5
         WHERE id = $1`,
        [userId, anonymizedUsername, anonymizedEmail, randomPasswordHash, reason]
      );
      await client.query("COMMIT");
      return res.json({
        erased: true,
        retention_policy:
          "Account personal data anonymized; operational content may be retained for security/legal moderation needs.",
      });
    } catch (e) {
      await client.query("ROLLBACK");
      logger.error({ err: e, userId }, "Account erasure failed");
      return res.status(500).json({ error: "Could not erase account" });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
