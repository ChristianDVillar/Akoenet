#!/usr/bin/env bash
# Tar+gzip local uploads directory (STORAGE_DRIVER=local). Optional S3 upload.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/akoenet}"
UPLOADS_PATH="${UPLOADS_PATH:-./backend/uploads}"
DATE="$(date +%Y%m%d_%H%M%S)"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BACKUP_BUCKET:-}"

mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/akonet_uploads_${DATE}.tar.gz"

if [[ ! -d "$UPLOADS_PATH" ]]; then
  echo "[backup-uploads] No directory at $UPLOADS_PATH — skip"
  exit 0
fi

echo "[backup-uploads] Archiving $UPLOADS_PATH → $OUT"
tar -czf "$OUT" -C "$(dirname "$UPLOADS_PATH")" "$(basename "$UPLOADS_PATH")"
echo "[backup-uploads] OK $(du -h "$OUT" | awk '{print $1}')"

if [[ -n "${AWS_ACCESS_KEY_ID:-}" && -n "$S3_BUCKET" ]]; then
  aws s3 cp "$OUT" "s3://${S3_BUCKET}/uploads/$(basename "$OUT")"
  echo "[backup-uploads] Uploaded to s3://${S3_BUCKET}/uploads/"
fi

find "$BACKUP_DIR" -name 'akonet_uploads_*.tar.gz' -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
echo "[backup-uploads] Done"
