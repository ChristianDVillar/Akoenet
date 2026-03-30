const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { Profanity } = require("@2toad/profanity");
const logger = require("./logger");

let profanityInstance = null;

function parseLanguages() {
  const raw = String(process.env.BLOCKED_WORDS_LANGUAGES || "en,es")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return raw.length ? raw : ["en"];
}

function loadExtraWordsFromEnv() {
  return String(process.env.BLOCKED_WORDS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function loadExtraWordsFromFile() {
  const p = String(process.env.BLOCKED_WORDS_FILE || "").trim();
  if (!p) return [];
  try {
    const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    const txt = fs.readFileSync(abs, "utf8");
    return txt
      .split(/\r?\n/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s && !s.startsWith("#"));
  } catch {
    return [];
  }
}

function getProfanity() {
  if (profanityInstance) return profanityInstance;
  const languages = parseLanguages();
  profanityInstance = new Profanity({
    languages,
    wholeWord: true,
    unicodeWordBoundaries: true,
  });
  const extra = [...new Set([...loadExtraWordsFromEnv(), ...loadExtraWordsFromFile()])];
  if (extra.length) profanityInstance.addWords(extra);
  return profanityInstance;
}

function isBlockedEnabled() {
  const v = String(process.env.BLOCKED_WORDS_ENABLED ?? "true").toLowerCase();
  return v !== "false" && v !== "0" && v !== "no";
}

const BLOCKED_MESSAGE = "This content contains prohibited language.";

function anonymizedUserFingerprint(userId) {
  if (userId == null) return null;
  return crypto.createHash("sha256").update(String(userId)).digest("hex").slice(0, 12);
}

/**
 * @param {object} [opts]
 * @param {string} [opts.source] — e.g. socket_channel_message, api_dm_post
 * @param {number|string} [opts.userId]
 */
function logBlockedLanguageHit(text, opts = {}) {
  const t = typeof text === "string" ? text.trim() : "";
  const len = t.length;
  const lengthBucket = len <= 20 ? "0-20" : len <= 200 ? "21-200" : "201+";
  logger.warn(
    {
      moderation_event: "blocked_content_attempt",
      source: opts.source || "unknown",
      length_bucket: lengthBucket,
      user_fp: anonymizedUserFingerprint(opts.userId),
    },
    "Blocked language attempt"
  );
}

/**
 * @param {string} text
 * @param {{ source?: string, userId?: number|string }} [logCtx] — when blocked, logs anonymized metadata
 */
function textContainsBlockedLanguage(text, logCtx) {
  if (!isBlockedEnabled()) return false;
  if (typeof text !== "string") return false;
  const t = text.trim();
  if (!t) return false;
  const blocked = getProfanity().exists(t);
  if (blocked && logCtx && logCtx.source) {
    logBlockedLanguageHit(t, logCtx);
  }
  return blocked;
}

/**
 * @param {string} text
 * @param {{ source?: string, userId?: number|string }} [opts]
 */
function assertContentAllowed(text, opts) {
  if (textContainsBlockedLanguage(text, opts)) {
    return { ok: false, code: "blocked_content", error: BLOCKED_MESSAGE };
  }
  return { ok: true };
}

module.exports = {
  textContainsBlockedLanguage,
  assertContentAllowed,
  BLOCKED_MESSAGE,
};
