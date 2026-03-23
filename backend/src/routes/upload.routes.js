const express = require("express");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const auth = require("../middleware/auth");
const { canAccessChannel } = require("../lib/membership");

const router = express.Router();

const uploadDir = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${path.extname(file.originalname) || ".bin"}`;
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post("/channel/:channelId", auth, upload.single("file"), async (req, res) => {
  const channelId = parseInt(req.params.channelId, 10);
  if (Number.isNaN(channelId)) {
    return res.status(400).json({ error: "Invalid channel" });
  }
  if (!(await canAccessChannel(req.user.id, channelId))) {
    return res.status(403).json({ error: "No access" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "file required" });
  }
  const publicPath = `/uploads/${req.file.filename}`;
  res.json({ url: publicPath, filename: req.file.filename });
});

module.exports = router;
