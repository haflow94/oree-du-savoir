#!/usr/bin/env bash
# Appelé par le hook OnFailure= des unités systemd critiques (voir
# scripts/systemd/oree-alerte-echec@.service) : notifie immédiatement sur
# ntfy quand l'une d'elles échoue. Pas de logique de bascule d'état ici
# (contrairement à rapporter_etat côté surveille-*.sh) : ces services ne
# tournent pas en continu, un OnFailure se déclenche déjà une seule fois
# par échec réel, inutile d'y ajouter un suivi persistant.
set -uo pipefail
cd "$(dirname "$0")"
# shellcheck source=lib/surveillance-ntfy.sh
source "./lib/surveillance-ntfy.sh"

if [ -z "${1:-}" ]; then
  echo "Usage : $0 <nom-unite-systemd>" >&2
  exit 1
fi
unite="$1"
alerter "Service systemd en échec : $unite" "Voir : journalctl -u $unite --no-pager -n 50" "urgent" "rotating_light"
