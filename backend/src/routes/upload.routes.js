const express = require("express");
const multer = require("multer");
const { z } = require("zod");
const pool = require("../config/db");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { uploadRateLimiter } = require("../middleware/rate-limit");
const { canSendToChannel, canManageChannels } = require("../lib/membership");
const FileType = require("file-type");
const { saveFile } = require("../services/storage");
const logger = require("../lib/logger");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
const channelIdParamSchema = z.object({
  channelId: z.coerce.number().int().positive(),
});
const conversationIdParamSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
});
const serverIdParamSchema = z.object({
  serverId: z.coerce.number().int().positive(),
});
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

function validateImageMime(file) {
  if (!file) {
    return "file required";
  }
  if (!allowedMimeTypes.has(String(file.mimetype || "").toLowerCase())) {
    return "Unsupported file type. Allowed: jpeg, png, webp, gif, avif";
  }
  return null;
}

/** Confirms declared MIME matches magic bytes (mitigates renamed executables). */
async function validateImageFile(file) {
  const mimeErr = validateImageMime(file);
  if (mimeErr) {
    return mimeErr;
  }
  if (!file.buffer || !file.buffer.length) {
    return "file required";
  }
  try {
    const head = file.buffer.subarray(0, Math.min(file.buffer.length, 4100));
    const ft = await FileType.fromBuffer(head);
    if (!ft) {
      return "Could not verify file type";
    }
    if (!allowedMimeTypes.has(ft.mime)) {
      return "File content does not match an allowed image type";
    }
    if (String(file.mimetype || "").toLowerCase() !== ft.mime) {
      return "File content does not match declared type";
    }
  } catch (e) {
    logger.warn({ err: e }, "file-type check failed");
    return "Could not verify file type";
  }
  return null;
}

router.post("/channel/:channelId", auth, uploadRateLimiter, validate({ params: channelIdParamSchema }), upload.single("file"), async (req, res) => {
  try {
    const channelId = req.params.channelId;
    if (!(await canSendToChannel(req.user.id, channelId))) {
      return res.status(403).json({ error: "No access" });
    }
    const fileError = await validateImageFile(req.file);
    if (fileError) {
      return res.status(400).json({ error: fileError });
    }
    const saved = await saveFile(req.file);
    res.json({ url: saved.url, filename: saved.filename });
  } catch (error) {
    logger.error({ err: error }, "Channel upload failed");
    res.status(500).json({ error: "upload failed" });
  }
});

router.post(
  "/direct/:conversationId",
  auth,
  uploadRateLimiter,
  validate({ params: conversationIdParamSchema }),
  upload.single("file"),
  async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    const allowed = await pool.query(
      `SELECT 1
       FROM direct_conversations
       WHERE id = $1
         AND (user_low_id = $2 OR user_high_id = $2)`,
      [conversationId, req.user.id]
    );
    if (!allowed.rows.length) {
      return res.status(403).json({ error: "No access" });
    }
    const fileError = await validateImageFile(req.file);
    if (fileError) {
      return res.status(400).json({ error: fileError });
    }
    const saved = await saveFile(req.file);
    res.json({ url: saved.url, filename: saved.filename });
  } catch (error) {
    logger.error({ err: error }, "Direct upload failed");
    res.status(500).json({ error: "upload failed" });
  }
}
);

router.post(
  "/server/:serverId/emoji",
  auth,
  uploadRateLimiter,
  validate({ params: serverIdParamSchema }),
  upload.single("file"),
  async (req, res) => {
    try {
      const serverId = req.params.serverId;
      if (!(await canManageChannels(req.user.id, serverId))) {
        return res.status(403).json({ error: "No access" });
      }
      const fileError = await validateImageFile(req.file);
      if (fileError) {
        return res.status(400).json({ error: fileError });
      }
      const saved = await saveFile(req.file);
      res.json({ url: saved.url, filename: saved.filename });
    } catch (error) {
      logger.error({ err: error }, "Server emoji upload failed");
      res.status(500).json({ error: "upload failed" });
    }
  }
);

module.exports = router;
