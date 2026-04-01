const dns = require("dns").promises;
const net = require("net");

function isPrivateOrReservedIPv4(ip) {
  const parts = String(ip).split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isBlockedHostname(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  return false;
}

/**
 * Resolve hostname and reject private/link-local targets (basic SSRF mitigation before fetch).
 * @param {string} hostname
 * @returns {Promise<void>}
 */
async function assertSafeHostname(hostname) {
  if (isBlockedHostname(hostname)) {
    const err = new Error("url_not_allowed");
    err.code = "SSRF_BLOCKED";
    throw err;
  }
  if (net.isIP(hostname)) {
    if (hostname.includes(":")) {
      const err = new Error("url_not_allowed");
      err.code = "SSRF_BLOCKED";
      throw err;
    }
    if (isPrivateOrReservedIPv4(hostname)) {
      const err = new Error("url_not_allowed");
      err.code = "SSRF_BLOCKED";
      throw err;
    }
    return;
  }
  const { address, family } = await dns.lookup(hostname);
  if (family === 6) {
    const err = new Error("url_not_allowed");
    err.code = "SSRF_BLOCKED";
    throw err;
  }
  if (isPrivateOrReservedIPv4(address)) {
    const err = new Error("url_not_allowed");
    err.code = "SSRF_BLOCKED";
    throw err;
  }
}

/**
 * @param {string} raw
 * @returns {URL}
 */
function parsePublicHttpUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    const err = new Error("invalid_url");
    err.code = "INVALID_URL";
    throw err;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    const err = new Error("invalid_url");
    err.code = "INVALID_URL";
    throw err;
  }
  if (u.username || u.password) {
    const err = new Error("invalid_url");
    err.code = "INVALID_URL";
    throw err;
  }
  return u;
}

module.exports = {
  assertSafeHostname,
  parsePublicHttpUrl,
};
