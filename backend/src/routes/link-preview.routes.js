const express = require("express");
const { z } = require("zod");
const validate = require("../middleware/validate");
const { linkPreviewRateLimiter } = require("../middleware/rate-limit");
const logger = require("../lib/logger");
const { fetchOpenGraphPreview } = require("../lib/link-preview-fetch");
const cache = require("../lib/link-preview-cache");

const router = express.Router();

const querySchema = z.object({
  url: z.string().trim().url().max(2000),
});

router.get("/", linkPreviewRateLimiter, validate({ query: querySchema }), async (req, res) => {
  const url = req.query.url;
  const cacheKey = url;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) {
    return res.json(hit.data);
  }
  try {
    const data = await fetchOpenGraphPreview(url);
    const payload = { ok: true, ...data };
    cache.set(cacheKey, { at: Date.now(), data: payload });
    return res.json(payload);
  } catch (e) {
    if (e?.code === "SSRF_BLOCKED" || e?.code === "INVALID_URL") {
      return res.status(400).json({ ok: false, error: "url_not_allowed" });
    }
    logger.warn({ err: e, url }, "link preview fetch failed");
    return res.status(502).json({ ok: false, error: "preview_unavailable" });
  }
});

module.exports = router;
