const { assertSafeHostname, parsePublicHttpUrl } = require("./ssrf-url");

const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;

function extractOg(html, prop) {
  const esc = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re1 = new RegExp(
    `<meta[^>]+property=["']${esc}["'][^>]+content=["']([^"']*)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${esc}["']`,
    "i"
  );
  let m = html.match(re1) || html.match(re2);
  if (m) return m[1].trim();
  return null;
}

function extractName(html, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<meta[^>]+name=["']${esc}["'][^>]+content=["']([^"']*)["']`, "i");
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
  return m ? m[1].trim().replace(/\s+/g, " ") : null;
}

/**
 * @param {string} urlString
 * @returns {Promise<{ url: string, title: string | null, description: string | null, image: string | null, site_name: string | null }>}
 */
async function fetchOpenGraphPreview(urlString) {
  const u = parsePublicHttpUrl(urlString);
  await assertSafeHostname(u.hostname);

  let current = u.toString();
  let lastHtml = "";

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    const next = parsePublicHttpUrl(current);
    await assertSafeHostname(next.hostname);

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    let res;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: ac.signal,
        headers: {
          "User-Agent": "AkoeNet-LinkPreview/1.0",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        },
      });
    } finally {
      clearTimeout(t);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      const resolved = new URL(loc, current);
      current = resolved.toString();
      continue;
    }

    if (!res.ok) {
      const err = new Error(`http_${res.status}`);
      err.code = "FETCH_FAILED";
      throw err;
    }

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
      return {
        url: current,
        title: null,
        description: null,
        image: null,
        site_name: null,
      };
    }

    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf;
    lastHtml = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    break;
  }

  if (!lastHtml) {
    return { url: urlString, title: null, description: null, image: null, site_name: null };
  }

  const title = extractOg(lastHtml, "og:title") || extractTitle(lastHtml);
  const description =
    extractOg(lastHtml, "og:description") || extractName(lastHtml, "description");
  let image = extractOg(lastHtml, "og:image");
  const siteName = extractOg(lastHtml, "og:site_name");

  if (image) {
    try {
      const imgUrl = new URL(image, current);
      if (imgUrl.protocol === "http:" || imgUrl.protocol === "https:") {
        await assertSafeHostname(imgUrl.hostname);
        image = imgUrl.toString();
      } else {
        image = null;
      }
    } catch {
      image = null;
    }
  }

  return {
    url: current,
    title: title || null,
    description: description || null,
    image,
    site_name: siteName || null,
  };
}

module.exports = { fetchOpenGraphPreview };
