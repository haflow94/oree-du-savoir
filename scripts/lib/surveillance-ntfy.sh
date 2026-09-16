#!/usr/bin/env bash
# Bibliothèque commune (à sourcer, jamais exécutée seule) partagée par les
# scripts scripts/surveille-*.sh et par le hook OnFailure= des unités
# systemd critiques (scripts/systemd/oree-alerte-echec@.service) : un seul
# canal d'alerte (ntfy.sh) et une seule logique de bascule d'état, pour
# notifier à chaque panne détectée, à chaque rétablissement, puis en rappel
# périodique tant que ça reste en panne — jamais en boucle à chaque passage
# du timer, jamais silencieux non plus si ça traîne.
#
# NTFY_TOPIC et RAPPEL_INTERVALLE_S peuvent être surchargés dans
# l'environnement de l'unité systemd appelante si besoin un jour ; sinon
# les valeurs par défaut ci-dessous s'appliquent (même topic que défini le
# 2026-09-16, voir conversation).
: "${NTFY_TOPIC:=oree-nas-e0dde1bd5193876d}"
NTFY_URL="https://ntfy.sh/$NTFY_TOPIC"
: "${ETAT_DIR:=/run/oree-surveillance}"
RAPPEL_INTERVALLE_S="${RAPPEL_INTERVALLE_S:-900}" # 15 min tant qu'un problème persiste
mkdir -p "$ETAT_DIR"

alerter() {
  local titre="$1" message="$2" priorite="$3" tags="$4"
  curl -fsS --max-time 10 \
    -H "Title: $titre" \
    -H "Priority: $priorite" \
    -H "Tags: $tags" \
    -d "$message" \
    "$NTFY_URL" >/dev/null 2>&1 \
    || echo "[surveillance] ATTENTION : échec d'envoi ntfy ($titre)" >&2
}

# Point d'entrée générique pour un contrôle "état binaire OK/échec" déjà
# évalué par l'appelant (qui a pu tenter sa propre remédiation avant
# d'appeler cette fonction, voir surveille-nas.sh).
#   $1 = clé d'état unique et stable (ex. "docker-oree-app-1")
#   $2 = libellé humain affiché dans la notification
#   $3 = "0" si OK, "1" si échec
#   $4 = détail optionnel à inclure dans le message de panne initiale
#        (défaut : horodatage générique) — ex. le pourcentage d'un disque.
rapporter_etat() {
  local cle="$1" libelle="$2" ok="$3" detail="${4:-}"
  local fichier_etat="$ETAT_DIR/${cle}.etat"
  local fichier_derniere_alerte="$ETAT_DIR/${cle}.derniere-alerte"

  if [ "$ok" = 0 ]; then
    if [ -f "$fichier_etat" ]; then
      local depuis
      depuis="$(cat "$fichier_etat" 2>/dev/null || echo inconnu)"
      alerter "$libelle rétabli" "OK de nouveau (en panne depuis $depuis)." "high" "white_check_mark"
      rm -f "$fichier_etat" "$fichier_derniere_alerte"
    fi
    return 0
  fi

  local maintenant
  maintenant="$(date '+%Y-%m-%d %H:%M:%S')"
  if [ ! -f "$fichier_etat" ]; then
    echo "$maintenant" >"$fichier_etat"
    date +%s >"$fichier_derniere_alerte"
    alerter "$libelle EN PANNE" "${detail:-Problème détecté à $maintenant.}" "urgent" "rotating_light"
    return 1
  fi

  local depuis derniere_alerte
  depuis="$(cat "$fichier_etat")"
  derniere_alerte="$(cat "$fichier_derniere_alerte" 2>/dev/null || echo 0)"
  if [ "$(($(date +%s) - derniere_alerte))" -ge "$RAPPEL_INTERVALLE_S" ]; then
    alerter "$libelle toujours en panne" "Toujours en échec (depuis $depuis)." "urgent" "rotating_light"
    date +%s >"$fichier_derniere_alerte"
  fi
  return 1
}
