#!/usr/bin/env bash
# Restaure une sauvegarde produite par scripts/backup.sh sur une stack
# docker-compose en cours d'exécution. Écrase les données actuelles.
#
# Usage : ./scripts/restore.sh <db-XXXX.dump> <documents-XXXX.tar.gz>
set -euo pipefail
cd "$(dirname "$0")/.."

DB_DUMP="${1:?Usage: restore.sh <db-XXXX.dump> <documents-XXXX.tar.gz>}"
DOCS_ARCHIVE="${2:?Usage: restore.sh <db-XXXX.dump> <documents-XXXX.tar.gz>}"

[ -f "$DB_DUMP" ] || { echo "Fichier introuvable : $DB_DUMP" >&2; exit 1; }
[ -f "$DOCS_ARCHIVE" ] || { echo "Fichier introuvable : $DOCS_ARCHIVE" >&2; exit 1; }

set -a
source .env
set +a

read -r -p "Ceci va écraser la base '$POSTGRES_DB' et les documents actuels. Continuer ? [y/N] " CONFIRM
[ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ] || { echo "Annulé."; exit 1; }

echo "[restore] Base de données <- $DB_DUMP"
docker compose exec -T db pg_restore --clean --if-exists --no-owner \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$DB_DUMP"

echo "[restore] Documents <- $DOCS_ARCHIVE"
docker compose exec -T app sh -c 'rm -rf /data/* && tar xzf - -C /data' < "$DOCS_ARCHIVE"

echo "[restore] Terminé. Redémarrage de l'application..."
docker compose restart app
