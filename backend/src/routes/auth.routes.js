const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../config/db");
const auth = require("../middleware/auth");

const router = express.Router();
const secret = process.env.JWT_SECRET || "dev-secret-change-me";
const twitchClientId = process.env.TWITCH_CLIENT_ID || "";
const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET || "";
const twitchRedirectUri =
  process.env.TWITCH_REDIRECT_URI || "http://localhost:3000/auth/twitch/callback";
const frontendOAuthRedirect =
  process.env.FRONTEND_OAUTH_REDIRECT || "http://localhost:5173/auth/twitch/callback";

function signAppToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, secret, { expiresIn: "7d" });
}

function getTwitchEmail(twitchId) {
  return `twitch_${twitchId}@twitch.local`;
}

router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "username, email, password required" });
    }
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
    console.error(e);
    res.status(500).json({ error: "Register failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email, password required" });
    }
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
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/twitch/start", (req, res) => {
  if (!twitchClientId || !twitchClientSecret) {
    return res.status(500).json({ error: "Twitch OAuth not configured on server" });
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

router.get("/twitch/callback", async (req, res) => {
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
      const created = await pool.query(
        `INSERT INTO users (username, email, password, avatar_url)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [twitchUser.display_name || twitchUser.login, email, passHash, twitchUser.profile_image_url || null]
      );
      userRes = created;
    } else {
      await pool.query(
        `UPDATE users SET username = $1, avatar_url = $2 WHERE id = $3`,
        [twitchUser.display_name || twitchUser.login, twitchUser.profile_image_url || null, userRes.rows[0].id]
      );
      userRes = await pool.query("SELECT * FROM users WHERE id = $1", [userRes.rows[0].id]);
    }

    const user = userRes.rows[0];
    const appToken = signAppToken(user);
    return res.redirect(`${frontendOAuthRedirect}?token=${encodeURIComponent(appToken)}`);
  } catch (e) {
    console.error(e);
    return res.redirect(`${frontendOAuthRedirect}?error=twitch_auth_failed`);
  }
});

router.get("/me", auth, async (req, res) => {
  const result = await pool.query(
    "SELECT id, username, email, avatar_url, created_at FROM users WHERE id = $1",
    [req.user.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(result.rows[0]);
});

module.exports = router;
