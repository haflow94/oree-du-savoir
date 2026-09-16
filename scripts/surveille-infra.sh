#!/usr/bin/env bash
# Complète surveille-nas.sh : surveille les conteneurs Docker de la stack,
# la joignabilité publique de la préinscription (donc le tunnel Cloudflare
# de bout en bout, pas seulement "le conteneur cloudflared tourne"), et
# l'espace disque de l'hôte. Alerte-only ici, aucune remédiation
# automatique (contrairement au remount NAS) : un conteneur qui redémarre
# seul mérite d'être vu, pas relancé aveuglément.
#
# Cadence resserrée à 2 min pendant la période d'inscription 2026-09-16 ->
# 2026-09-30 (voir oree-surveille-infra.timer) ; à desserrer ensuite.
#
# Pas de `set -e` : chaque contrôle doit s'exécuter même si un autre échoue.
set -uo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=lib/surveillance-ntfy.sh
source "$(dirname "$0")/lib/surveillance-ntfy.sh"

SEUIL_DISQUE_PCT=85

# --- Conteneurs Docker -------------------------------------------------
# Noms fixes (projet compose "oree", voir docker-compose.yml) plutôt qu'une
# découverte dynamique : on veut être alerté aussi si un conteneur a
# disparu (jamais démarré, supprimé par erreur), pas seulement s'il est en
# mauvais état.
CONTENEURS="oree-app-1 oree-db-1 oree-documenso-1 oree-documenso-db-1 oree-documenso-mail-1 oree-documenso-minio-1 oree-n8n-1 oree-cloudflared-1"

for conteneur in $CONTENEURS; do
  info="$(docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}aucun{{end}}|{{.RestartCount}}' "$conteneur" 2>/dev/null || true)"

  if [ -z "$info" ]; then
    rapporter_etat "docker-$conteneur" "Conteneur $conteneur introuvable" 1
    continue
  fi

  statut="${info%%|*}"
  reste="${info#*|}"
  sante="${reste%%|*}"
  redemarrages="${reste#*|}"

  # Redémarrage détecté depuis le dernier passage : alerte ponctuelle
  # distincte de rapporter_etat (utile même si le conteneur est de nouveau
  # "running" au moment du contrôle — sans ça, un cycle crash/restart plus
  # rapide que les 2 min du timer resterait invisible).
  fichier_redemarrages="$ETAT_DIR/docker-$conteneur.redemarrages"
  precedent="$(cat "$fichier_redemarrages" 2>/dev/null || echo "$redemarrages")"
  if [ "$redemarrages" -gt "$precedent" ] 2>/dev/null; then
    alerter "Conteneur $conteneur : redémarrage détecté" "Compteur de redémarrages $precedent -> $redemarrages (statut actuel : $statut)." "high" "warning"
  fi
  echo "$redemarrages" >"$fichier_redemarrages"

  ok=0
  { [ "$statut" = "running" ] && [ "$sante" != "unhealthy" ]; } || ok=1
  rapporter_etat "docker-$conteneur" "Conteneur $conteneur" "$ok"
done

# --- Joignabilité publique de la préinscription (bout en bout) ---------
# Charge PREINSCRIPTION_PUBLIC_HOSTNAME depuis .env, même mécanisme que
# scripts/backup.sh.
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

if [ -n "${PREINSCRIPTION_PUBLIC_HOSTNAME:-}" ]; then
  # /favicon.ico plutôt que /preinscription : depuis le jeton permanent
  # (voir src/proxy.ts, commit e2f76c1), /preinscription sans ?code= 404
  # délibérément sur le hostname public — /favicon.ico est le seul chemin
  # statique toujours autorisé (cheminAutoriseSurHotePublicPreinscription)
  # qui ne dépend d'aucun jeton/code à connaître ici, donc le bon candidat
  # pour vérifier bout en bout tunnel + app + cloisonnement par hostname.
  # Pas de -f ici : on veut lire le code HTTP nous-mêmes (curl -f
  # masquerait la sortie -w et casserait le fallback 000).
  code_http="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' \
    "https://${PREINSCRIPTION_PUBLIC_HOSTNAME}/favicon.ico" 2>/dev/null || echo 000)"
  ok=0
  [ "$code_http" = "200" ] || ok=1
  rapporter_etat "tunnel-preinscription" "Accès public préinscription ($PREINSCRIPTION_PUBLIC_HOSTNAME)" "$ok" "Code HTTP $code_http sur https://$PREINSCRIPTION_PUBLIC_HOSTNAME/favicon.ico (tunnel Cloudflare, app, ou cloisonnement par hostname en cause)."
fi

# --- Espace disque de l'hôte --------------------------------------------
utilise_pct="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"
ok=0
[ -n "$utilise_pct" ] && [ "$utilise_pct" -lt "$SEUIL_DISQUE_PCT" ] 2>/dev/null || ok=1
rapporter_etat "disque-racine" "Espace disque hôte" "$ok" "Partition / utilisée à ${utilise_pct:-?}% (seuil ${SEUIL_DISQUE_PCT}%)."
