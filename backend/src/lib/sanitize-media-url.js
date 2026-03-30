/**
 * DB may contain dev MinIO URLs (http://localhost:9000/bucket/key). Rewrite to API-relative
 * /uploads/:key so HTTPS clients never load mixed http://localhost from production.
 */
function sanitizeMediaUrl(url) {
  if (url == null || typeof url !== "string") return url;
  const s = url.trim();
  if (!s.startsWith("http")) return url;
  try {
    const u = new URL(s);
    const h = u.hostname.toLowerCase();
    if (h !== "localhost" && h !== "127.0.0.1" && h !== "[::1]") return url;
    const segments = u.pathname.split("/").filter(Boolean);
    const key = segments[segments.length - 1];
    if (!key || !/^[a-zA-Z0-9._-]+$/.test(key)) return url;
    return `/uploads/${encodeURIComponent(key)}`;
  } catch {
    return url;
  }
}

function sanitizeUserMediaFields(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  if (out.avatar_url != null) out.avatar_url = sanitizeMediaUrl(out.avatar_url);
  if (out.banner_url != null) out.banner_url = sanitizeMediaUrl(out.banner_url);
  return out;
}

/** For messages, emojis, etc. */
function sanitizeImageUrlField(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  if (out.image_url != null) out.image_url = sanitizeMediaUrl(out.image_url);
  return out;
}

module.exports = { sanitizeMediaUrl, sanitizeUserMediaFields, sanitizeImageUrlField };
