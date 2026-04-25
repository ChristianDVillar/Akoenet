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
const { buildSteamLoginUrl, collectOpenIdParams, verifySteamOpenIdAssertion } = require("../lib/steam-openid");
const { notifyGameActivityChange, clearSteamActivityForUser } = require("../lib/game-activity");
const { getJwtSecret } = require("../lib/jwt-secret");
const { assertContentAllowed, BLOCKED_MESSAGE } = require("../lib/blocked-content");
const { sha256Hex, createStoredRefreshToken } = require("../lib/refresh-token");
const { getCurrentTermsVersion, mergeTermsFieldsIntoUserPayload } = require("../lib/legal-terms");
const requireTermsAccepted = require("../middleware/require-terms");
const { sendRegistrationVerificationEmail, isResendConfigured } = require("../lib/resend-mail");
const { authenticator } = require("otplib");
const { generateSecret, verify: verifyTotp } = require("../lib/totp");

const router = express.Router();
const secret = getJwtSecret();
const tokenVersion = parseInt(process.env.TOKEN_VERSION || "2", 10);
const twitchClientId = process.env.TWITCH_CLIENT_ID || "";
const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET || "";
const steamWebApiKey = String(process.env.STEAM_WEB_API_KEY || "").trim();

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
const steamCallbackPathname = "/auth/steam/callback";

function sameOriginAndPath(urlA, urlB) {
  try {
    const a = new URL(String(urlA || ""));
    const b = new URL(String(urlB || ""));
    return a.origin === b.origin && a.pathname.replace(/\/+$/, "") === b.pathname.replace(/\/+$/, "");
  } catch {
    return false;
  }
}

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

/**
 * Must match frontend routing: Vite defaults to HashRouter when RENDER=true at build
 * (see frontend/vite.config.js). Links without # break on static hosts and HashRouter
 * ignores pathname-only URLs even if /* → index.html is configured.
 */
const useHashRouter = (() => {
  const explicit = String(process.env.FRONTEND_HASH_ROUTER || "").trim().toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return process.env.RENDER === "true";
})();

function buildRegistrationCompleteUrl(rawToken) {
  const q = `token=${encodeURIComponent(rawToken)}`;
  if (useHashRouter) {
    const base = stripTrailingSlash(frontendBase);
    return `${base}/#${`/register/complete?${q}`}`;
  }
  const base = stripTrailingSlash(frontendBase);
  return new URL(`register/complete?${q}`, `${base}/`).toString();
}

function maskEmailForDisplay(emailNorm) {
  const parts = String(emailNorm || "").split("@");
  if (parts.length < 2) return "***";
  const local = parts[0];
  const domain = parts.slice(1).join("@");
  const safe = local.length <= 1 ? "*" : `${local[0]}***`;
  return `${safe}@${domain}`;
}

/** Twitch OAuth redirect: must match Twitch Developer Console exactly (HTTPS on Render). */
const twitchRedirectUri = (() => {
  const override = stripTrailingSlash(process.env.TWITCH_REDIRECT_URI || "");
  if (override && !(onHostedRender && isLocalhostUrl(override))) {
    return override;
  }
  return `${publicApiBase}/auth/twitch/callback`;
})();

/**
 * HashRouter (p. ej. Render) solo expone query dentro del fragmento `/#/?a=b`.
 * `/?a=b` en la URL principal no llega a `useSearchParams()` → Steam/Twitch "link" parecía no persistir.
 */
function spaRedirectWithQuery(params) {
  const base = stripTrailingSlash(frontendBase);
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, String(v));
  }
  const qs = sp.toString();
  if (!qs) return `${base}/`;
  if (useHashRouter) {
    return `${base}/#/?${qs}`;
  }
  return `${base}/?${qs}`;
}

/**
 * After Twitch login/signup OAuth: tokens en query (o en hash si HashRouter).
 */
function twitchOAuthSuccessUrl(appToken, refreshToken) {
  const p = { twitch_token: appToken };
  if (refreshToken) p.refresh_token = refreshToken;
  return spaRedirectWithQuery(p);
}

function twitchOAuthErrorUrl(code) {
  return spaRedirectWithQuery({ twitch_error: String(code) });
}

function twitchOAuthNativeUrl(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `akoenet://oauth/twitch?${qs}` : "akoenet://oauth/twitch";
}

function twitchOAuthErrorRedirect(code, decodedState) {
  if (decodedState?.native === true) {
    return twitchOAuthNativeUrl({ error: String(code) });
  }
  return twitchOAuthErrorUrl(code);
}

function steamLinkSuccessUrl() {
  return spaRedirectWithQuery({ steam_linked: "1" });
}

/** After linking Twitch from User settings (session stays the same; no new JWT in URL). */
function twitchLinkSuccessUrl() {
  return spaRedirectWithQuery({ twitch_linked: "1" });
}

function steamLinkErrorUrl(code) {
  return spaRedirectWithQuery({ steam_error: String(code) });
}

/** Base URL shown in /auth/twitch/status (OAuth returns ?twitch_token= or ?twitch_error= on /). */
const frontendOAuthRedirect = new URL("/", frontendBase).href;

/** Short-lived access JWT + refresh in DB (rotation on /auth/refresh). Override with JWT_EXPIRES_IN. */
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || "30m";

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
      expiresIn: jwtExpiresIn,
    }
  );
}

/** User object for login/refresh responses; includes terms / GDPR gate fields. */
function buildAuthUserPayload(user, overrides = {}) {
  return mergeTermsFieldsIntoUserPayload(
    user,
    sanitizeUserMediaFields({
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
      totp_enabled: Boolean(user.totp_enabled),
      push_notifications_enabled: user.push_notifications_enabled !== false,
      steam_linked: Boolean(user.steam_id),
      share_game_activity: user.share_game_activity !== false,
      desktop_game_detect_opt_in: Boolean(user.desktop_game_detect_opt_in),
      manual_activity_game: user.manual_activity_game ?? null,
      manual_activity_platform: user.manual_activity_platform ?? null,
      ...overrides,
    })
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

const registerStartSchema = z.object({
  email: z.string().trim().email().max(120),
  invite: z.string().trim().min(1).max(200).optional(),
});

const registerCompleteSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/i),
    username: z.string().trim().min(2).max(40),
    password: z.string().min(6).max(200),
    birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "birth_date must be YYYY-MM-DD"),
    accept_terms_version: z.string().trim().min(1).max(32),
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
  )
  .refine((data) => data.accept_terms_version === getCurrentTermsVersion(), {
    message: "You must accept the current Terms and Privacy Policy.",
    path: ["accept_terms_version"],
  });

const registerPendingQuerySchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(120),
  password: z.string().min(1).max(200),
});

const termsAcceptSchema = z
  .object({
    version: z.string().trim().min(1).max(32),
  })
  .refine((data) => data.version === getCurrentTermsVersion(), {
    message: "You must accept the current published Terms and Privacy Policy version.",
    path: ["version"],
  });

const refreshTokenSchema = z.object({
  refresh_token: z.string().min(20).max(512),
});

const login2faSchema = z.object({
  two_factor_token: z.string().min(20),
  code: z.string().min(6).max(12),
});

const totpEnableSchema = z.object({
  code: z.string().min(6).max(12),
});

const totpDisableSchema = z.object({
  password: z.string().min(1).max(200),
  code: z.string().min(6).max(12),
});

const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(4000),
  keys: z.object({
    p256dh: z.string().min(20).max(2000),
    auth: z.string().min(10).max(500),
  }),
});
const nativePushSubscribeSchema = z.object({
  token: z.string().trim().min(20).max(4096),
  platform: z.enum(["android", "ios"]),
  device_id: z.string().trim().min(6).max(128).optional(),
  device_name: z.string().trim().max(255).optional(),
  app_version: z.string().trim().max(64).optional(),
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
    push_notifications_enabled: z.boolean().optional(),
    /** When true, clears linked Steam ID on save. */
    steam_unlink: z.boolean().optional(),
    /** When true, clears linked Twitch username on save. */
    twitch_unlink: z.boolean().optional(),
    share_game_activity: z.boolean().optional(),
    desktop_game_detect_opt_in: z.boolean().optional(),
    manual_activity_game: z.preprocess(
      emptyToNull,
      z.string().trim().max(120).nullable().optional()
    ),
    manual_activity_platform: z.preprocess(
      emptyToNull,
      z.string().trim().max(40).nullable().optional()
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

router.get("/terms/version", (_req, res) => {
  res.json({ current_terms_version: getCurrentTermsVersion() });
});

router.post(
  "/terms/accept",
  auth,
  userDataRateLimiter,
  validate({ body: termsAcceptSchema }),
  async (req, res) => {
    const cur = getCurrentTermsVersion();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const upd = await client.query(
        `UPDATE users
         SET terms_version = $1, terms_accepted_at = NOW()
         WHERE id = $2 AND deleted_at IS NULL
         RETURNING *`,
        [cur, req.user.id]
      );
      if (!upd.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "User not found" });
      }
      await client.query(
        `INSERT INTO legal_terms_acceptances (user_id, terms_version, accepted_at) VALUES ($1, $2, NOW())`,
        [req.user.id, cur]
      );
      await client.query("COMMIT");
      res.json({ ok: true, user: buildAuthUserPayload(upd.rows[0]) });
    } catch (e) {
      await client.query("ROLLBACK");
      logger.error({ err: e }, "terms/accept failed");
      res.status(500).json({ error: "Could not record terms acceptance" });
    } finally {
      client.release();
    }
  }
);

router.post("/register/start", authRateLimiter, validate({ body: registerStartSchema }), async (req, res) => {
  try {
    const emailNorm = String(req.body.email).trim().toLowerCase();
    const inviteRaw = req.body.invite != null ? String(req.body.invite).trim() : "";
    const invite = inviteRaw.length ? inviteRaw : null;

    const existing = await pool.query(
      `SELECT 1 FROM users WHERE LOWER(TRIM(email)) = $1 AND deleted_at IS NULL LIMIT 1`,
      [emailNorm]
    );
    if (existing.rows.length > 0) {
      return res.json({ sent: true });
    }

    await pool.query(`DELETE FROM registration_tokens WHERE email_norm = $1`, [emailNorm]);

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(rawToken);
    const verifyUrl = buildRegistrationCompleteUrl(rawToken);

    await pool.query(
      `INSERT INTO registration_tokens (email_norm, token_hash, invite_token, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')`,
      [emailNorm, tokenHash, invite]
    );

    if (!isResendConfigured()) {
      logger.warn({ verifyUrl }, "RESEND_API_KEY not set; registration link logged");
      if (process.env.NODE_ENV === "production") {
        await pool.query(`DELETE FROM registration_tokens WHERE token_hash = $1`, [tokenHash]);
        return res.status(503).json({ error: "email_not_configured" });
      }
      return res.status(200).json({ sent: true, dev_verify_url: verifyUrl });
    }

    const mailRes = await sendRegistrationVerificationEmail({ to: emailNorm, verifyUrl });
    if (!mailRes.ok) {
      await pool.query(`DELETE FROM registration_tokens WHERE token_hash = $1`, [tokenHash]);
      logger.warn({ error: mailRes.error }, "Registration verification email failed");
      if (process.env.NODE_ENV === "production") {
        return res.status(503).json({ error: "email_send_failed" });
      }
      return res.status(200).json({ sent: true, dev_verify_url: verifyUrl, warning: "email_send_failed_dev" });
    }

    return res.json({ sent: true });
  } catch (e) {
    logger.error({ err: e }, "register/start failed");
    res.status(500).json({ error: "Register start failed" });
  }
});

router.get("/register/pending", authRateLimiter, validate({ query: registerPendingQuerySchema }), async (req, res) => {
  try {
    const raw = String(req.query.token || "").trim();
    const tokenHash = sha256Hex(raw);
    const row = await pool.query(
      `SELECT email_norm, invite_token, expires_at FROM registration_tokens WHERE token_hash = $1`,
      [tokenHash]
    );
    if (row.rows.length === 0) {
      return res.status(400).json({ error: "invalid_or_expired_token" });
    }
    const r = row.rows[0];
    if (new Date(r.expires_at) < new Date()) {
      return res.status(400).json({ error: "invalid_or_expired_token" });
    }
    return res.json({
      email_masked: maskEmailForDisplay(r.email_norm),
      invite: r.invite_token || null,
    });
  } catch (e) {
    logger.error({ err: e }, "register/pending failed");
    res.status(500).json({ error: "Register pending failed" });
  }
});

router.post("/register/complete", authRateLimiter, validate({ body: registerCompleteSchema }), async (req, res) => {
  const {
    token: rawToken,
    username,
    password,
    birth_date: birthDate,
    accept_terms_version: acceptedTermsVersion,
  } = req.body;
  if (!assertContentAllowed(username, { source: "register_username" }).ok) {
    return res.status(400).json({ error: "blocked_content", message: BLOCKED_MESSAGE });
  }
  const client = await pool.connect();
  try {
    const tokenHash = sha256Hex(rawToken);
    await client.query("BEGIN");
    const tokRes = await client.query(
      `DELETE FROM registration_tokens
       WHERE token_hash = $1 AND expires_at > NOW()
       RETURNING email_norm`,
      [tokenHash]
    );
    if (tokRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "invalid_or_expired_token" });
    }
    const emailNorm = tokRes.rows[0].email_norm;
    const hash = await bcrypt.hash(password, 10);
    const result = await client.query(
      `INSERT INTO users (username, email, password, birth_date, age_verified_at, terms_version, terms_accepted_at)
       VALUES ($1, $2, $3, $4::date, NOW(), $5, NOW())
       RETURNING id, username, email, created_at, terms_version, terms_accepted_at`,
      [username, emailNorm, hash, birthDate, acceptedTermsVersion]
    );
    const uid = result.rows[0].id;
    await client.query(
      `INSERT INTO legal_terms_acceptances (user_id, terms_version, accepted_at) VALUES ($1, $2, NOW())`,
      [uid, acceptedTermsVersion]
    );
    await client.query("COMMIT");
    res.status(201).json(result.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }
    logger.error({ err: e }, "Register complete failed");
    res.status(500).json({ error: "Register failed" });
  } finally {
    client.release();
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
    if (user.totp_enabled && user.totp_secret) {
      const two_factor_token = jwt.sign(
        { purpose: "2fa_login", uid: user.id, tv: tokenVersion },
        secret,
        { expiresIn: "5m" }
      );
      return res.json({ requires_2fa: true, two_factor_token });
    }
    const token = signAppToken(user);
    const refresh_token = await createStoredRefreshToken(pool, user.id);
    res.json({
      token,
      refresh_token,
      user: buildAuthUserPayload(user),
    });
  } catch (e) {
    logger.error({ err: e }, "Login failed");
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/login/2fa", authRateLimiter, validate({ body: login2faSchema }), async (req, res) => {
  let decoded;
  try {
    decoded = jwt.verify(req.body.two_factor_token, secret);
  } catch {
    return res.status(401).json({ error: "invalid_two_factor_token" });
  }
  if (decoded.purpose !== "2fa_login" || decoded.uid == null || decoded.tv !== tokenVersion) {
    return res.status(401).json({ error: "invalid_two_factor_token" });
  }
  try {
    const userRes = await pool.query(`SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`, [decoded.uid]);
    if (!userRes.rows.length) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const user = userRes.rows[0];
    if (!user.totp_enabled || !user.totp_secret) {
      return res.status(400).json({ error: "2fa_not_active" });
    }
    if (!verifyTotp(user.totp_secret, req.body.code)) {
      return res.status(401).json({ error: "invalid_code" });
    }
    const token = signAppToken(user);
    const refresh_token = await createStoredRefreshToken(pool, user.id);
    res.json({
      token,
      refresh_token,
      user: buildAuthUserPayload(user, { totp_enabled: true }),
    });
  } catch (e) {
    logger.error({ err: e }, "Login 2FA failed");
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/refresh", authRateLimiter, validate({ body: refreshTokenSchema }), async (req, res) => {
  try {
    const raw = req.body.refresh_token;
    const hash = sha256Hex(raw);
    const found = await pool.query(
      `SELECT rt.id, rt.user_id, rt.expires_at
       FROM refresh_tokens rt
       INNER JOIN users u ON u.id = rt.user_id AND u.deleted_at IS NULL
       WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL`,
      [hash]
    );
    if (!found.rows.length) {
      return res.status(401).json({ error: "invalid_refresh_token" });
    }
    const row = found.rows[0];
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await pool.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);
      return res.status(401).json({ error: "refresh_token_expired" });
    }
    const userRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [row.user_id]);
    if (!userRes.rows.length) {
      return res.status(401).json({ error: "invalid_refresh_token" });
    }
    const user = userRes.rows[0];
    await pool.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);
    const token = signAppToken(user);
    const refresh_token = await createStoredRefreshToken(pool, user.id);
    res.json({
      token,
      refresh_token,
      user: buildAuthUserPayload(user),
    });
  } catch (e) {
    logger.error({ err: e }, "Refresh token failed");
    res.status(500).json({ error: "Refresh failed" });
  }
});

router.post("/logout", authRateLimiter, async (req, res) => {
  try {
    const raw = req.body?.refresh_token;
    if (typeof raw === "string" && raw.length >= 20) {
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
        [sha256Hex(raw)]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, "Logout failed");
    res.status(500).json({ error: "Logout failed" });
  }
});

/** Revoke all refresh tokens for the current user (logout every device). Access JWT still valid until it expires. */
router.post("/logout-all", auth, requireTermsAccepted, userDataRateLimiter, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [req.user.id]
    );
    res.json({ ok: true, revoked_sessions: r.rowCount ?? 0 });
  } catch (e) {
    logger.error({ err: e }, "Logout all failed");
    res.status(500).json({ error: "Logout failed" });
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
  const native = String(req.query?.native || "").trim().toLowerCase();
  const nativeFlow = native === "1" || native === "true";
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = jwt.sign({ nonce, native: nativeFlow }, secret, { expiresIn: "10m" });
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

/** Start OAuth in the browser; state ties the callback to the logged-in user (email/password accounts). */
router.post("/twitch/link/begin", auth, requireTermsAccepted, userDataRateLimiter, (req, res) => {
  if (!twitchClientId || !twitchClientSecret) {
    return res.status(503).json({
      error: "twitch_not_configured",
      message: "Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in the backend environment.",
    });
  }
  const state = jwt.sign({ purpose: "twitch_link", uid: req.user.id }, secret, { expiresIn: "10m" });
  const qs = new URLSearchParams({
    client_id: twitchClientId,
    redirect_uri: twitchRedirectUri,
    response_type: "code",
    scope: "",
    state,
  });
  res.json({ url: `https://id.twitch.tv/oauth2/authorize?${qs.toString()}` });
});

router.get("/twitch/callback", authRateLimiter, async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) {
    return res.redirect(twitchOAuthErrorUrl("missing_code_or_state"));
  }
  let decoded;
  try {
    decoded = jwt.verify(String(state), secret);
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
      return res.redirect(twitchOAuthErrorRedirect("twitch_token_failed", decoded));
    }
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return res.redirect(twitchOAuthErrorRedirect("twitch_no_access_token", decoded));
    }

    const meRes = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": twitchClientId,
      },
    });
    if (!meRes.ok) {
      return res.redirect(twitchOAuthErrorRedirect("twitch_user_failed", decoded));
    }
    const meData = await meRes.json();
    const twitchUser = meData?.data?.[0];
    if (!twitchUser?.id || !twitchUser?.login) {
      return res.redirect(twitchOAuthErrorRedirect("twitch_invalid_user", decoded));
    }

    const login = String(twitchUser.login || "").trim().toLowerCase();

    if (decoded.purpose === "twitch_link") {
      const uid = Number(decoded.uid);
      if (!Number.isInteger(uid) || uid <= 0) {
        return res.redirect(twitchOAuthErrorUrl("invalid_state"));
      }
      const selfRow = await pool.query(`SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`, [uid]);
      if (!selfRow.rows.length) {
        return res.redirect(twitchOAuthErrorUrl("user_not_found"));
      }
      const twitchEmail = getTwitchEmail(twitchUser.id);
      const otherByEmail = await pool.query(
        `SELECT id FROM users WHERE email = $1 AND id <> $2 AND deleted_at IS NULL LIMIT 1`,
        [twitchEmail, uid]
      );
      if (otherByEmail.rows.length) {
        return res.redirect(twitchOAuthErrorUrl("twitch_account_in_use"));
      }
      const otherByLogin = await pool.query(
        `SELECT id FROM users WHERE twitch_username IS NOT NULL AND LOWER(TRIM(twitch_username)) = $1 AND id <> $2 AND deleted_at IS NULL LIMIT 1`,
        [login, uid]
      );
      if (otherByLogin.rows.length) {
        return res.redirect(twitchOAuthErrorUrl("twitch_username_taken"));
      }
      await pool.query(
        `UPDATE users SET twitch_username = $1, avatar_url = COALESCE($2, avatar_url) WHERE id = $3 AND deleted_at IS NULL`,
        [login, twitchUser.profile_image_url || null, uid]
      );
      return res.redirect(twitchLinkSuccessUrl());
    }

    const email = getTwitchEmail(twitchUser.id);
    let userRes = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

    if (!userRes.rows.length) {
      const randomPass = crypto.randomBytes(24).toString("hex");
      const passHash = await bcrypt.hash(randomPass, 10);
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
    const refreshRaw = await createStoredRefreshToken(pool, user.id);
    if (decoded?.native === true) {
      return res.redirect(
        twitchOAuthNativeUrl({
          token: appToken,
          refresh_token: refreshRaw,
        })
      );
    }
    return res.redirect(twitchOAuthSuccessUrl(appToken, refreshRaw));
  } catch (e) {
    logger.error({ err: e }, "Twitch callback failed");
    return res.redirect(twitchOAuthErrorRedirect("twitch_auth_failed", decoded));
  }
});

/** Returns a Steam OpenID URL; client opens it in the same window. Requires STEAM_WEB_API_KEY for linking. */
router.post("/steam/link/begin", auth, requireTermsAccepted, userDataRateLimiter, (req, res) => {
  if (!steamWebApiKey) {
    return res.status(503).json({
      error: "steam_not_configured",
      message: "Set STEAM_WEB_API_KEY in the backend environment.",
    });
  }
  const state = jwt.sign({ purpose: "steam_link", uid: req.user.id }, secret, { expiresIn: "10m" });
  const returnTo = `${publicApiBase}/auth/steam/callback?state=${encodeURIComponent(state)}`;
  const url = buildSteamLoginUrl(returnTo, publicApiBase);
  res.json({ url });
});

router.get("/steam/status", (_req, res) => {
  res.json({
    webApiConfigured: Boolean(steamWebApiKey),
    callbackUrl: `${publicApiBase}/auth/steam/callback`,
  });
});

router.get("/steam/callback", authRateLimiter, async (req, res) => {
  const stateRaw = req.query.state;
  const stateStr = typeof stateRaw === "string" ? stateRaw : Array.isArray(stateRaw) ? stateRaw[0] : "";
  let decoded;
  try {
    decoded = jwt.verify(String(stateStr), secret);
  } catch {
    return res.redirect(steamLinkErrorUrl("invalid_state"));
  }
  if (decoded.purpose !== "steam_link" || decoded.uid == null) {
    return res.redirect(steamLinkErrorUrl("invalid_state"));
  }
  const uid = Number(decoded.uid);
  if (!Number.isInteger(uid) || uid <= 0) {
    return res.redirect(steamLinkErrorUrl("invalid_state"));
  }

  const openid = collectOpenIdParams(req.query);
  const expectedCallbackUrl = `${publicApiBase}${steamCallbackPathname}`;
  const returnTo = String(openid["openid.return_to"] || "");
  const realm = String(openid["openid.realm"] || "");
  const mode = String(openid["openid.mode"] || "").trim();

  if (Object.keys(openid).length === 0) {
    logger.warn({ uid, queryKeys: Object.keys(req.query || {}) }, "Steam OpenID params missing");
    return res.redirect(steamLinkErrorUrl("missing_openid_params"));
  }
  const requiredOpenIdKeys = [
    "openid.return_to",
    "openid.signed",
    "openid.sig",
    "openid.assoc_handle",
    "openid.response_nonce",
    "openid.claimed_id",
    "openid.identity",
  ];
  const missingOpenIdKeys = requiredOpenIdKeys.filter((k) => !String(openid[k] || "").trim());
  if (missingOpenIdKeys.length) {
    logger.warn({ uid, missingOpenIdKeys, openidKeys: Object.keys(openid) }, "Steam OpenID required keys missing");
    return res.redirect(steamLinkErrorUrl("missing_openid_keys"));
  }
  if (mode && mode !== "id_res") {
    logger.warn({ uid, mode }, "Steam OpenID mode unexpected");
    return res.redirect(steamLinkErrorUrl("invalid_openid_mode"));
  }

  // Fail fast with explicit reason when callback host/protocol/path do not match
  // what the backend used when creating the OpenID request.
  if (returnTo && !sameOriginAndPath(returnTo, expectedCallbackUrl)) {
    logger.warn(
      {
        uid,
        returnTo,
        expectedCallbackUrl,
        publicApiBase,
      },
      "Steam OpenID callback mismatch"
    );
    return res.redirect(steamLinkErrorUrl("callback_mismatch"));
  }
  if (realm && !sameOriginAndPath(realm, publicApiBase)) {
    logger.warn(
      {
        uid,
        realm,
        expectedRealm: publicApiBase,
      },
      "Steam OpenID realm mismatch"
    );
    return res.redirect(steamLinkErrorUrl("realm_mismatch"));
  }

  let steamId;
  try {
    steamId = await verifySteamOpenIdAssertion(openid);
  } catch (e) {
    logger.error(
      { err: e, steamOpenIdBodyPreview: e.steamOpenIdBodyPreview },
      "Steam OpenID verify failed"
    );
    return res.redirect(steamLinkErrorUrl("verify_failed"));
  }
  if (!steamId) {
    logger.warn(
      {
        uid,
        openidKeys: Object.keys(openid),
        openidMode: openid["openid.mode"],
        openidReturnTo: returnTo,
        openidRealm: realm,
        expectedCallbackUrl,
        expectedRealm: publicApiBase,
      },
      "Steam OpenID not verified"
    );
    return res.redirect(steamLinkErrorUrl("not_verified"));
  }

  try {
    const taken = await pool.query(
      `SELECT id FROM users WHERE steam_id = $1 AND id <> $2 AND deleted_at IS NULL LIMIT 1`,
      [steamId, uid]
    );
    if (taken.rows.length) {
      return res.redirect(steamLinkErrorUrl("steam_id_taken"));
    }
    await pool.query(`UPDATE users SET steam_id = $1 WHERE id = $2 AND deleted_at IS NULL`, [steamId, uid]);
    const io = req.app?.locals?.io;
    if (io) notifyGameActivityChange(io, uid).catch(() => {});
    return res.redirect(steamLinkSuccessUrl());
  } catch (e) {
    logger.error({ err: e }, "Steam link save failed");
    return res.redirect(steamLinkErrorUrl("save_failed"));
  }
});

router.get("/push/vapid-public-key", (_req, res) => {
  const k = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  if (!k) return res.status(503).json({ error: "push_not_configured" });
  res.json({ publicKey: k });
});

router.post("/push/subscribe", auth, requireTermsAccepted, validate({ body: pushSubscribeSchema }), async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, subscription_type, native_platform, native_token, updated_at)
       VALUES ($1, $2, $3, $4, 'web', NULL, NULL, NOW())
       ON CONFLICT (user_id, endpoint) DO UPDATE
       SET p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           subscription_type = 'web',
           native_platform = NULL,
           native_token = NULL,
           updated_at = NOW()`,
      [req.user.id, endpoint, keys.p256dh, keys.auth]
    );
    res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, "push subscribe failed");
    res.status(500).json({ error: "subscribe_failed" });
  }
});

router.post(
  "/push/native/subscribe",
  auth,
  requireTermsAccepted,
  validate({ body: nativePushSubscribeSchema }),
  async (req, res) => {
    try {
      const token = String(req.body.token || "").trim();
      const platform = String(req.body.platform || "").trim().toLowerCase();
      const deviceId = String(req.body.device_id || "").trim() || null;
      const deviceName = String(req.body.device_name || "").trim() || null;
      const appVersion = String(req.body.app_version || "").trim() || null;
      if (deviceId) {
        await pool.query(
          `DELETE FROM push_subscriptions
           WHERE user_id = $1
             AND subscription_type = 'native'
             AND native_platform = $2
             AND device_id = $3`,
          [req.user.id, platform, deviceId]
        );
      } else {
        await pool.query(
          `DELETE FROM push_subscriptions
           WHERE user_id = $1
             AND subscription_type = 'native'
             AND native_platform = $2`,
          [req.user.id, platform]
        );
      }
      await pool.query(
        `INSERT INTO push_subscriptions (
           user_id,
           endpoint,
           p256dh,
           auth,
           subscription_type,
           native_platform,
           native_token,
           device_id,
           device_name,
           app_version,
           last_seen_at,
           updated_at
         )
         VALUES ($1, NULL, NULL, NULL, 'native', $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (native_token) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             subscription_type = 'native',
             native_platform = EXCLUDED.native_platform,
             device_id = EXCLUDED.device_id,
             device_name = EXCLUDED.device_name,
             app_version = EXCLUDED.app_version,
             last_seen_at = NOW(),
             endpoint = NULL,
             p256dh = NULL,
             auth = NULL,
             updated_at = NOW()`,
        [req.user.id, platform, token, deviceId, deviceName, appVersion]
      );
      res.json({ ok: true });
    } catch (e) {
      logger.error({ err: e }, "native push subscribe failed");
      res.status(500).json({ error: "native_subscribe_failed" });
    }
  }
);

router.delete("/push/native/subscribe", auth, requireTermsAccepted, async (req, res) => {
  const platform = String(req.query.platform || "").trim().toLowerCase();
  const token = String(req.query.token || "").trim();
  const deviceId = String(req.query.device_id || "").trim();
  if (deviceId) {
    await pool.query(
      `DELETE FROM push_subscriptions
       WHERE user_id = $1
         AND subscription_type = 'native'
         AND device_id = $2`,
      [req.user.id, deviceId]
    );
    return res.json({ ok: true });
  }
  if (platform === "android" || platform === "ios") {
    await pool.query(
      `DELETE FROM push_subscriptions
       WHERE user_id = $1
         AND subscription_type = 'native'
         AND native_platform = $2`,
      [req.user.id, platform]
    );
    return res.json({ ok: true });
  }
  if (token) {
    await pool.query(
      `DELETE FROM push_subscriptions
       WHERE user_id = $1
         AND subscription_type = 'native'
         AND native_token = $2`,
      [req.user.id, token]
    );
    return res.json({ ok: true });
  }
  await pool.query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND subscription_type = 'native'`, [
    req.user.id,
  ]);
  res.json({ ok: true });
});

router.delete("/push/subscribe", auth, requireTermsAccepted, async (req, res) => {
  const endpoint = String(req.query.endpoint || "").trim();
  if (!endpoint) {
    await pool.query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND subscription_type = 'web'`, [
      req.user.id,
    ]);
  } else {
    await pool.query(
      `DELETE FROM push_subscriptions
       WHERE user_id = $1
         AND subscription_type = 'web'
         AND endpoint = $2`,
      [req.user.id, endpoint]
    );
  }
  res.json({ ok: true });
});

router.post("/2fa/setup", auth, requireTermsAccepted, userDataRateLimiter, async (req, res) => {
  try {
    const row = await pool.query(`SELECT totp_enabled FROM users WHERE id = $1`, [req.user.id]);
    if (row.rows[0]?.totp_enabled) {
      return res.status(400).json({ error: "already_enabled" });
    }
    const sec = generateSecret();
    await pool.query(`UPDATE users SET totp_pending_secret = $1 WHERE id = $2`, [sec, req.user.id]);
    const label = String(req.user.email || `user_${req.user.id}`);
    const otpauth_url = authenticator.keyuri(label, "AkoeNet", sec);
    res.json({ secret: sec, otpauth_url });
  } catch (e) {
    logger.error({ err: e }, "2fa setup failed");
    res.status(500).json({ error: "setup_failed" });
  }
});

router.post("/2fa/enable", auth, requireTermsAccepted, userDataRateLimiter, validate({ body: totpEnableSchema }), async (req, res) => {
  const row = await pool.query(`SELECT totp_pending_secret FROM users WHERE id = $1`, [req.user.id]);
  const pending = row.rows[0]?.totp_pending_secret;
  if (!pending) return res.status(400).json({ error: "no_pending_setup" });
  if (!verifyTotp(pending, req.body.code)) return res.status(400).json({ error: "invalid_code" });
  await pool.query(
    `UPDATE users SET totp_secret = totp_pending_secret, totp_pending_secret = NULL, totp_enabled = true WHERE id = $1`,
    [req.user.id]
  );
  res.json({ ok: true });
});

router.post("/2fa/disable", auth, requireTermsAccepted, userDataRateLimiter, validate({ body: totpDisableSchema }), async (req, res) => {
  const userRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
  const user = userRes.rows[0];
  if (!user?.totp_enabled) return res.status(400).json({ error: "not_enabled" });
  const pwOk = await bcrypt.compare(req.body.password, user.password);
  if (!pwOk) return res.status(400).json({ error: "invalid_password" });
  if (!verifyTotp(user.totp_secret, req.body.code)) return res.status(400).json({ error: "invalid_code" });
  await pool.query(
    `UPDATE users SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled = false WHERE id = $1`,
    [req.user.id]
  );
  res.json({ ok: true });
});

router.get("/me", auth, async (req, res) => {
  const result = await pool.query(
   `SELECT id, username, email, avatar_url, banner_url, accent_color, bio, presence_status, custom_status, is_admin, twitch_username, scheduler_streamer_username, created_at,
            steam_id,
            terms_version, terms_accepted_at,
            COALESCE(share_game_activity, true) AS share_game_activity,
            COALESCE(desktop_game_detect_opt_in, false) AS desktop_game_detect_opt_in,
            manual_activity_game, manual_activity_platform,
            COALESCE(totp_enabled, false) AS totp_enabled,
            COALESCE(push_notifications_enabled, true) AS push_notifications_enabled
     FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "User not found" });
  }
  const row = result.rows[0];
  const { steam_id: steamId, terms_version: _tv, terms_accepted_at: _tmt, ...rest } = row;
  res.json(
    mergeTermsFieldsIntoUserPayload(
      row,
      sanitizeUserMediaFields({
        ...rest,
        steam_linked: Boolean(steamId),
        steam_status: { web_api_configured: Boolean(steamWebApiKey) },
      })
    )
  );
});

router.get("/me/export", auth, async (req, res) => {
  const userId = req.user.id;
  const [profileRes, serverRes, channelMessageRes, dmMessageRes] = await Promise.all([
    pool.query(
      `SELECT id, username, email, avatar_url, banner_url, accent_color, bio, presence_status, custom_status,
              twitch_username, scheduler_streamer_username, birth_date, created_at,
              steam_id, share_game_activity, desktop_game_detect_opt_in,
              manual_activity_game, manual_activity_platform
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

router.get("/me/reports", auth, requireTermsAccepted, async (req, res) => {
  const result = await pool.query(
    `SELECT
       a.id,
       a.action AS report_action,
       a.created_at,
       a.server_id,
       a.channel_id,
       a.target_message_id,
       COALESCE(a.metadata->>'status', 'open') AS status,
       a.metadata->>'reason' AS reason,
       a.metadata->>'details' AS details,
       a.metadata->>'moderator_note' AS moderator_note,
       a.metadata->>'reviewed_at' AS reviewed_at
     FROM admin_audit_logs a
     WHERE a.actor_user_id = $1
       AND a.action IN ('message_report_user', 'dm_message_report_user')
     ORDER BY a.created_at DESC
     LIMIT 200`,
    [req.user.id]
  );
  res.json(result.rows);
});

router.patch("/me", auth, requireTermsAccepted, userDataRateLimiter, validate({ body: updateSettingsSchema }), async (req, res) => {
  const {
    username,
    avatar_url,
    banner_url,
    accent_color,
    bio,
    presence_status: presenceStatus,
    custom_status: customStatus,
    scheduler_streamer_username: schedulerStreamerUsername,
    push_notifications_enabled: pushNotificationsEnabled,
    steam_unlink: steamUnlink,
    twitch_unlink: twitchUnlink,
    share_game_activity: shareGameActivity,
    desktop_game_detect_opt_in: desktopGameDetectOptIn,
    manual_activity_game: manualActivityGame,
    manual_activity_platform: manualActivityPlatform,
    current_password: currentPassword,
    new_password: newPassword,
  } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT id, username, email, password, avatar_url, banner_url, accent_color, bio, presence_status, custom_status, is_admin, twitch_username, scheduler_streamer_username, created_at,
              steam_id,
              COALESCE(share_game_activity, true) AS share_game_activity,
              COALESCE(desktop_game_detect_opt_in, false) AS desktop_game_detect_opt_in,
              manual_activity_game, manual_activity_platform,
              COALESCE(push_notifications_enabled, true) AS push_notifications_enabled
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
    const nextPush =
      pushNotificationsEnabled !== undefined ? Boolean(pushNotificationsEnabled) : user.push_notifications_enabled;
    const nextPasswordHash = newPassword ? await bcrypt.hash(newPassword, 10) : user.password;
    const nextSteamId = steamUnlink === true ? null : user.steam_id;
    const nextTwitchUsername = twitchUnlink === true ? null : user.twitch_username;
    const nextShare =
      shareGameActivity !== undefined ? Boolean(shareGameActivity) : user.share_game_activity;
    const nextDesktop =
      desktopGameDetectOptIn !== undefined ? Boolean(desktopGameDetectOptIn) : user.desktop_game_detect_opt_in;
    const nextManualGame =
      manualActivityGame !== undefined ? manualActivityGame : user.manual_activity_game;
    const nextManualPlatform =
      manualActivityPlatform !== undefined ? manualActivityPlatform : user.manual_activity_platform;

    const profileStrings = [
      nextUsername,
      nextBio,
      nextCustomStatus,
      nextSchedulerSlug,
      nextManualGame,
      nextManualPlatform,
    ].filter((v) => v != null && String(v).trim() !== "");
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
           scheduler_streamer_username = $10,
           push_notifications_enabled = $11,
           steam_id = $12,
           twitch_username = $13,
           share_game_activity = $14,
           desktop_game_detect_opt_in = $15,
           manual_activity_game = $16,
           manual_activity_platform = $17
       WHERE id = $1
       RETURNING id, username, email, avatar_url, banner_url, accent_color, bio, presence_status, custom_status, is_admin, twitch_username, scheduler_streamer_username, created_at,
                 steam_id,
                 terms_version, terms_accepted_at,
                 COALESCE(share_game_activity, true) AS share_game_activity,
                 COALESCE(desktop_game_detect_opt_in, false) AS desktop_game_detect_opt_in,
                 manual_activity_game, manual_activity_platform,
                 COALESCE(totp_enabled, false) AS totp_enabled,
                 COALESCE(push_notifications_enabled, true) AS push_notifications_enabled`,
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
        nextPush,
        nextSteamId,
        nextTwitchUsername,
        nextShare,
        nextDesktop,
        nextManualGame,
        nextManualPlatform,
      ]
    );
    await client.query("COMMIT");
    const row = updated.rows[0];
    const { steam_id: stId, terms_version: _tv, terms_accepted_at: _tmt, ...restOut } = row;
    if (steamUnlink === true) clearSteamActivityForUser(req.user.id);
    const io = req.app?.locals?.io;
    if (io) notifyGameActivityChange(io, req.user.id).catch(() => {});
    return res.json(
      mergeTermsFieldsIntoUserPayload(
        row,
        sanitizeUserMediaFields({
          ...restOut,
          steam_linked: Boolean(stId),
          steam_status: { web_api_configured: Boolean(steamWebApiKey) },
        })
      )
    );
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "23505") {
      const detail = String(e.detail || "");
      if (detail.includes("twitch_username")) {
        return res.status(409).json({ error: "That Twitch username is already linked to another account." });
      }
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
      await client.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM push_subscriptions WHERE user_id = $1`, [userId]);
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
             steam_id = NULL,
             share_game_activity = true,
             desktop_game_detect_opt_in = false,
             manual_activity_game = NULL,
             manual_activity_platform = NULL,
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
