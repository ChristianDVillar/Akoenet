#!/usr/bin/env bash
# Run DB + local uploads backups in one cron-friendly step.
# From repo root:  DATABASE_URL=... ./scripts/backup-all.sh
# Or:              cd /path/to/AkoeNet && export DATABASE_URL && ./scripts/backup-all.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[backup-all] $(date -Iseconds) starting"
bash "$ROOT/scripts/backup-db.sh"
bash "$ROOT/scripts/backup-uploads.sh"
echo "[backup-all] done"
