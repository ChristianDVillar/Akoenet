/**
 * Best-effort extraction of a numeric message id from a free-text URL (channel or DM message).
 */
function extractMessageIdFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  const s = url.trim();
  const patterns = [
    /\/messages\/(\d+)/i,
    /message[_-]?id=(\d+)/i,
    /[?&]m=(\d+)/i,
    /#message-(\d+)/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

module.exports = { extractMessageIdFromUrl };
