const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { z } = require("zod");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { authRateLimiter } = require("../middleware/rate-limit");
const logger = require("../lib/logger");

const router = express.Router();
const secret = process.env.JWT_SECRET || "dev-secret-change-me";
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

/** Where Twitch callback sends the user after issuing the app JWT (SPA /auth/twitch/callback). */
const frontendOAuthRedirect = (() => {
  const override = stripTrailingSlash(process.env.FRONTEND_OAUTH_REDIRECT || "");
  if (override && !(onHostedRender && isLocalhostUrl(override))) {
    return override;
  }
  return `${frontendBase}/auth/twitch/callback`;
})();

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

const registerSchema = z.object({
  username: z.string().trim().min(2).max(40),
  email: z.string().trim().email().max(120),
  password: z.string().min(6).max(200),
});

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

router.post("/register", authRateLimiter, validate({ body: registerSchema }), async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, created_at`,
      [username, email, hash]
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
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = signAppToken(user);
    res.json({
      token,
      user: {
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
      },
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
      hint: "Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in the backend environment. On Render, set FRONTEND_URL to your SPA URL (or FRONTEND_OAUTH_REDIRECT). Register the backend callback URL in the Twitch Developer Console (same as TWITCH_REDIRECT_URI or {PUBLIC_API_URL|RENDER_EXTERNAL_URL}/auth/twitch/callback).",
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
    return res.redirect(`${frontendOAuthRedirect}?error=missing_code_or_state`);
  }
  try {
    jwt.verify(String(state), secret);
  } catch {
    return res.redirect(`${frontendOAuthRedirect}?error=invalid_state`);
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
      return res.redirect(`${frontendOAuthRedirect}?error=twitch_token_failed`);
    }
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return res.redirect(`${frontendOAuthRedirect}?error=twitch_no_access_token`);
    }

    const meRes = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": twitchClientId,
      },
    });
    if (!meRes.ok) {
      return res.redirect(`${frontendOAuthRedirect}?error=twitch_user_failed`);
    }
    const meData = await meRes.json();
    const twitchUser = meData?.data?.[0];
    if (!twitchUser?.id || !twitchUser?.login) {
      return res.redirect(`${frontendOAuthRedirect}?error=twitch_invalid_user`);
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
    return res.redirect(`${frontendOAuthRedirect}?token=${encodeURIComponent(appToken)}`);
  } catch (e) {
    logger.error({ err: e }, "Twitch callback failed");
    return res.redirect(`${frontendOAuthRedirect}?error=twitch_auth_failed`);
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
  res.json(result.rows[0]);
});

router.patch("/me", auth, validate({ body: updateSettingsSchema }), async (req, res) => {
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
    return res.json(updated.rows[0]);
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

module.exports = router;
