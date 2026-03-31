#!/usr/bin/env bash
# PostgreSQL logical backup (gzip). Run from cron or a sidecar container.
# Requires: pg_dump, gzip; optional: aws cli for S3 upload.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/akoenet}"
DATE="$(date +%Y%m%d_%H%M%S)"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BACKUP_BUCKET:-}"

: "${DATABASE_URL:?Set DATABASE_URL (same as backend)}"

mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/akonet_db_${DATE}.sql.gz"

echo "[backup-db] Starting → $OUT"
pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip >"$OUT"
echo "[backup-db] OK $(du -h "$OUT" | awk '{print $1}')"

if [[ -n "${AWS_ACCESS_KEY_ID:-}" && -n "$S3_BUCKET" ]]; then
  aws s3 cp "$OUT" "s3://${S3_BUCKET}/$(basename "$OUT")"
  echo "[backup-db] Uploaded to s3://${S3_BUCKET}/"
fi

find "$BACKUP_DIR" -name 'akonet_db_*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
echo "[backup-db] Done"
