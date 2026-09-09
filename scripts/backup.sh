#!/usr/bin/env bash
# Sauvegarde complète de la stack docker-compose en cours d'exécution :
#   - PostgreSQL application (db)
#   - PostgreSQL Documenso (documenso-db)
#   - Stockage S3 Documenso (volume documenso_minio_data — les PDF
#     signés eux-mêmes, cf. NEXT_PUBLIC_UPLOAD_TRANSPORT=s3 dans
#     docker-compose.yml : la base documenso-db ne contient que les
#     métadonnées/pointeurs, jamais les fichiers)
#   - Données n8n (workflows/credentials, volume n8n_data)
#   - Documents applicatifs (volume documents de app)
#   - Configuration nécessaire à reconstruire la stack (.env,
#     docker-compose.yml, certificat de signature Documenso)
#
# Usage : ./scripts/backup.sh [dossier_destination]
#   dossier_destination par défaut : ./backups (local, hors dépôt Git — voir
#   .gitignore). Pour une sauvegarde réelle, pointer explicitement vers le
#   NAS une fois les droits d'écriture réglés, ex :
#     ./scripts/backup.sh /mnt/nas/Administration/Sauvegardes-Oree
#
# Le dossier de configuration (.env notamment) contient des secrets : cette
# sauvegarde en hérite. Ne jamais la copier vers un emplacement plus
# largement accessible que .env lui-même.
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="${1:-./backups}"
mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"

# Vérification explicite d'écriture avant de lancer quoi que ce soit : mieux
# vaut échouer bruyamment ici que découvrir après coup (ex. via un cron
# silencieux) que la destination — en particulier un partage NAS — n'accepte
# pas l'écriture pour cet utilisateur.
TEST_FILE="$DEST/.ecriture-$$"
if ! ( touch "$TEST_FILE" 2>/dev/null && rm -f "$TEST_FILE" ); then
  echo "[backup] ERREUR : impossible d'écrire dans '$DEST'. Vérifier les droits (voir audit du 2026-09-08 sur les permissions NAS) avant de relancer." >&2
  exit 1
fi

set -a
source .env
set +a

STAMP="$(date +%Y%m%d-%H%M%S)"
DB_DUMP="$DEST/db-app-$STAMP.dump"
DOCUMENSO_DB_DUMP="$DEST/db-documenso-$STAMP.dump"
DOCUMENSO_MINIO_ARCHIVE="$DEST/documenso-minio-$STAMP.tar.gz"
DOCS_ARCHIVE="$DEST/documents-$STAMP.tar.gz"
N8N_ARCHIVE="$DEST/n8n-$STAMP.tar.gz"
CONFIG_ARCHIVE="$DEST/config-$STAMP.tar.gz"

echo "[backup] Base de données application -> $DB_DUMP"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$DB_DUMP"

echo "[backup] Base de données Documenso -> $DOCUMENSO_DB_DUMP"
docker compose exec -T documenso-db pg_dump -U "$DOCUMENSO_POSTGRES_USER" -Fc "$DOCUMENSO_POSTGRES_DB" > "$DOCUMENSO_DB_DUMP"

echo "[backup] Stockage S3 Documenso (volume documenso_minio_data) -> $DOCUMENSO_MINIO_ARCHIVE"
# L'image minio/minio n'embarque ni tar ni sh utilisable pour cet usage
# (distroless) : on passe par un conteneur alpine jetable qui monte le même
# volume via --volumes-from, comme le fait tout backup Docker classique d'un
# volume nommé. alpine est déjà présent en local (aucun pull réseau requis).
docker run --rm \
  --user "$(id -u):$(id -g)" \
  --volumes-from "$(docker compose ps -q documenso-minio)" \
  -v "$DEST:/backup-out" \
  alpine tar czf "/backup-out/$(basename "$DOCUMENSO_MINIO_ARCHIVE")" -C /data .

echo "[backup] Documents (volume documents de app) -> $DOCS_ARCHIVE"
docker compose exec -T app tar czf - -C /data . > "$DOCS_ARCHIVE"

echo "[backup] Données n8n (workflows/credentials, volume n8n_data) -> $N8N_ARCHIVE"
docker compose exec -T n8n tar czf - -C /home/node/.n8n . > "$N8N_ARCHIVE"

echo "[backup] Configuration de reconstruction (.env, docker-compose.yml, certificat Documenso) -> $CONFIG_ARCHIVE"
CONFIG_FILES=(.env docker-compose.yml)
[ -f documenso-cert/cert.p12 ] && CONFIG_FILES+=(documenso-cert/cert.p12)
tar czf "$CONFIG_ARCHIVE" "${CONFIG_FILES[@]}"

echo "[backup] Terminé :"
echo "  $DB_DUMP"
echo "  $DOCUMENSO_DB_DUMP"
echo "  $DOCUMENSO_MINIO_ARCHIVE"
echo "  $DOCS_ARCHIVE"
echo "  $N8N_ARCHIVE"
echo "  $CONFIG_ARCHIVE"
