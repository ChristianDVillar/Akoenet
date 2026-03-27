const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const uploadDir = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const driver = (process.env.STORAGE_DRIVER || "local").toLowerCase();

const s3Bucket = process.env.S3_BUCKET || "";
const s3Endpoint = process.env.S3_ENDPOINT || "";
const s3Region = process.env.S3_REGION || "us-east-1";
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID || "";
const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "";
const s3ForcePathStyle = String(process.env.S3_FORCE_PATH_STYLE || "true") === "true";
const storagePublicBaseUrl = process.env.STORAGE_PUBLIC_BASE_URL || "";
const usePresignedUrls = String(process.env.S3_USE_PRESIGNED_URLS || "true") === "true";
const rawSignedTtl = parseInt(process.env.S3_SIGNED_URL_TTL_SECONDS || "900", 10);
const s3SignedUrlTtlSeconds = Number.isFinite(rawSignedTtl)
  ? Math.min(Math.max(rawSignedTtl, 60), 3600)
  : 900;
const allowedImageMimes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

let s3Client = null;
let s3ReadyPromise = null;
if (driver === "s3") {
  s3Client = new S3Client({
    region: s3Region,
    endpoint: s3Endpoint || undefined,
    forcePathStyle: s3ForcePathStyle,
    credentials:
      s3AccessKeyId && s3SecretAccessKey
        ? {
            accessKeyId: s3AccessKeyId,
            secretAccessKey: s3SecretAccessKey,
          }
        : undefined,
  });
}

function extFromMime(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/avif") return ".avif";
  return ".bin";
}

function safeExt(originalname, mimeType) {
  const ext = path.extname(originalname || "").slice(0, 12);
  if (ext) return ext.toLowerCase();
  return extFromMime(mimeType);
}

function buildPublicUrl(key) {
  const safeKey = encodeURIComponent(key);
  if (driver === "s3" && usePresignedUrls) {
    // Stable app URL; app resolves this to a short-lived presigned URL.
    return `/uploads/${safeKey}`;
  }
  if (storagePublicBaseUrl) {
    return `${storagePublicBaseUrl.replace(/\/$/, "")}/${safeKey}`;
  }
  if (driver === "s3" && s3Endpoint && s3Bucket) {
    return `${s3Endpoint.replace(/\/$/, "")}/${s3Bucket}/${safeKey}`;
  }
  return `/uploads/${safeKey}`;
}

function assertSafeKey(key) {
  if (!/^[a-zA-Z0-9._-]+$/.test(String(key || ""))) {
    throw new Error("Invalid storage key");
  }
}

async function resolveDownloadUrl(key) {
  assertSafeKey(key);
  if (driver !== "s3") {
    return buildPublicUrl(key);
  }
  await ensureS3Bucket();
  if (!usePresignedUrls) {
    return buildPublicUrl(key);
  }
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: s3Bucket,
      Key: key,
    }),
    { expiresIn: s3SignedUrlTtlSeconds }
  );
}

async function ensureS3Bucket() {
  if (driver !== "s3") return;
  if (!s3Client || !s3Bucket) throw new Error("S3 storage is not fully configured");
  if (s3ReadyPromise) return s3ReadyPromise;
  s3ReadyPromise = (async () => {
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: s3Bucket }));
    } catch {
      await s3Client.send(new CreateBucketCommand({ Bucket: s3Bucket }));
    }
  })();
  return s3ReadyPromise;
}

async function saveFile(file) {
  const mime = String(file?.mimetype || "").toLowerCase();
  if (!allowedImageMimes.has(mime)) {
    throw new Error("Unsupported file mime type");
  }
  const key = `${Date.now()}-${randomUUID()}${safeExt(file?.originalname, file?.mimetype)}`;
  if (driver === "s3") {
    await ensureS3Bucket();
    await s3Client.send(
      new PutObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || "application/octet-stream",
      })
    );
    return { key, url: buildPublicUrl(key), filename: key };
  }

  const fullPath = path.join(uploadDir, key);
  await fs.promises.writeFile(fullPath, file.buffer);
  return { key, url: buildPublicUrl(key), filename: key };
}

async function getStorageStatus() {
  if (driver !== "s3") {
    return { driver: "local", ok: true };
  }
  try {
    await ensureS3Bucket();
    return {
      driver: "s3",
      ok: true,
      bucket: s3Bucket || null,
      endpoint: s3Endpoint || null,
    };
  } catch (error) {
    return {
      driver: "s3",
      ok: false,
      bucket: s3Bucket || null,
      endpoint: s3Endpoint || null,
      error: error?.message || "storage_error",
    };
  }
}

module.exports = { saveFile, getStorageStatus, resolveDownloadUrl };
