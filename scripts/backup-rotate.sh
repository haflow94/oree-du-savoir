#!/usr/bin/env bash
# Purge les sauvegardes produites par scripts/backup.sh selon une politique
# de rétention "quotidien + hebdomadaire", sans jamais toucher à un fichier
# qui ne correspond pas exactement au motif de nommage de backup.sh.
#
# Un "run" = les 6 fichiers d'une même exécution, identifiés par
# l'horodatage AAAAMMJJ-HHMMSS présent dans leur nom (db-app-<horodatage>.dump
# sert de référence pour lister les runs existants).
#
# Politique :
#   - les RETENTION_QUOTIDIENNE runs les plus récents sont conservés ;
#   - au-delà, un run par semaine ISO est conservé pendant
#     RETENTION_HEBDO semaines supplémentaires ;
#   - tout le reste est supprimé.
#
# Ne s'exécute qu'après un backup.sh réussi (voir
# scripts/systemd/oree-backup.service : deux ExecStart séquentiels, le
# second ne tourne pas si le premier échoue) — ne supprime donc jamais de
# sauvegarde au profit d'une sauvegarde du jour ratée.
#
# Usage : ./scripts/backup-rotate.sh <dossier> [retention_quotidienne] [retention_hebdo_semaines]
set -euo pipefail

DEST="${1:?Usage: backup-rotate.sh <dossier> [retention_quotidienne] [retention_hebdo_semaines]}"
DAILY_KEEP="${2:-14}"
WEEKLY_KEEP="${3:-8}"

[ -d "$DEST" ] || { echo "[rotate] ERREUR : dossier introuvable '$DEST'" >&2; exit 1; }

mapfile -t RUNS < <(find "$DEST" -maxdepth 1 -name 'db-app-*.dump' -printf '%f\n' \
  | sed -E 's/^db-app-(.*)\.dump$/\1/' \
  | sort -r)

if [ "${#RUNS[@]}" -eq 0 ]; then
  echo "[rotate] Aucune sauvegarde trouvée dans '$DEST', rien à faire."
  exit 0
fi

KEEP=()
for ((i = 0; i < ${#RUNS[@]} && i < DAILY_KEEP; i++)); do
  KEEP+=("${RUNS[$i]}")
done

declare -A SEEN_WEEK
WEEKS_KEPT=0
for ((i = DAILY_KEEP; i < ${#RUNS[@]}; i++)); do
  run="${RUNS[$i]}"
  day="${run%%-*}"
  week="$(date -d "${day:0:4}-${day:4:2}-${day:6:2}" +%G-W%V 2>/dev/null || true)"
  [ -n "$week" ] || continue
  if [ -z "${SEEN_WEEK[$week]:-}" ]; then
    if [ "$WEEKS_KEPT" -ge "$WEEKLY_KEEP" ]; then
      continue
    fi
    SEEN_WEEK["$week"]=1
    WEEKS_KEPT=$((WEEKS_KEPT + 1))
    KEEP+=("$run")
  fi
done

is_kept() {
  local candidate="$1"
  local k
  for k in "${KEEP[@]}"; do
    [ "$k" = "$candidate" ] && return 0
  done
  return 1
}

DELETED=0
for run in "${RUNS[@]}"; do
  if ! is_kept "$run"; then
    echo "[rotate] Suppression du run $run"
    rm -f "$DEST"/db-app-"$run".dump \
          "$DEST"/db-documenso-"$run".dump \
          "$DEST"/documenso-minio-"$run".tar.gz \
          "$DEST"/documents-"$run".tar.gz \
          "$DEST"/n8n-"$run".tar.gz \
          "$DEST"/config-"$run".tar.gz
    DELETED=$((DELETED + 1))
  fi
done

echo "[rotate] Terminé : ${#KEEP[@]} run(s) conservé(s), $DELETED run(s) supprimé(s)."
