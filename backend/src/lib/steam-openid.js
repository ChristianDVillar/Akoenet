const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";

function collectOpenIdParams(query) {
  const out = {};
  if (!query || typeof query !== "object") return out;
  for (const [k, raw] of Object.entries(query)) {
    if (!k.startsWith("openid.")) continue;
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v != null && v !== "") out[k] = String(v);
  }
  return out;
}

function buildSteamLoginUrl(returnTo, realm) {
  const p = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID_ENDPOINT}?${p.toString()}`;
}

/**
 * @param {Record<string, string>} openidParams from the redirect query (openid.* only)
 * @returns {Promise<string|null>} SteamID64 or null
 */
async function verifySteamOpenIdAssertion(openidParams) {
  const mode = String(openidParams["openid.mode"] || "").trim();
  if (mode !== "id_res") return null;
  const claimed = openidParams["openid.claimed_id"] || "";
  if (!claimed.includes("/openid/id/")) return null;

  const body = new URLSearchParams();
  body.set("openid.mode", "check_authentication");
  for (const [k, v] of Object.entries(openidParams)) {
    if (k.startsWith("openid.")) body.set(k, v);
  }

  // Steam (and some CDNs) often treat requests without a browser-like User-Agent as bots
  // and respond in ways that omit is_valid:true → OpenID verification fails in production.
  const res = await fetch(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/plain,*/*",
      "User-Agent":
        "Mozilla/5.0 (compatible; AkoeNet/1.0; +https://specs.openid.net/auth/2.0)",
    },
    body: body.toString(),
    signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(25_000) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Steam OpenID HTTP ${res.status}`);
    err.steamOpenIdBodyPreview = text.slice(0, 200);
    throw err;
  }
  if (/\bis_valid\s*:\s*false\b/i.test(text)) return null;
  if (!/\bis_valid\s*:\s*true\b/i.test(text)) return null;

  const m = String(claimed).match(/\/openid\/id\/(\d+)(?:\/)?$/);
  return m ? m[1] : null;
}

module.exports = {
  STEAM_OPENID_ENDPOINT,
  collectOpenIdParams,
  buildSteamLoginUrl,
  verifySteamOpenIdAssertion,
};
