#!/usr/bin/env bash
# Sauvegarde la base PostgreSQL (format custom pg_dump) et le volume de
# documents (app_data) d'une stack docker-compose en cours d'exécution.
#
# Usage : ./scripts/backup.sh [dossier_destination]
#   dossier_destination par défaut : ./backups
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="${1:-./backups}"
mkdir -p "$DEST"

set -a
source .env
set +a

STAMP="$(date +%Y%m%d-%H%M%S)"
DB_DUMP="$DEST/db-$STAMP.dump"
DOCS_ARCHIVE="$DEST/documents-$STAMP.tar.gz"

echo "[backup] Base de données -> $DB_DUMP"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$DB_DUMP"

echo "[backup] Documents (volume app_data) -> $DOCS_ARCHIVE"
docker compose exec -T app tar czf - -C /data . > "$DOCS_ARCHIVE"

echo "[backup] Terminé :"
echo "  $DB_DUMP"
echo "  $DOCS_ARCHIVE"
