#!/usr/bin/env bash
# Surveille les deux montages NAS utilisés par la stack (mnt-nas-Etudiant,
# mnt-nas-Administration) : un montage CIFS peut rester "active" côté
# systemd tout en étant bloqué en écriture (vécu le 2026-09-16 : le partage
# Étudiant est resté en échec plusieurs heures sans que personne ne le
# remarque, bloquant la validation des préinscriptions). Ce script teste
# une écriture réelle et tente un `systemctl restart` de l'unité en panne
# (le service tourne en root, donc sans sudo interactif) avant de rapporter
# l'état à la bibliothèque d'alerte commune (scripts/lib/surveillance-ntfy.sh).
#
# Cadence resserrée à 2 min (voir oree-surveille-nas.timer) pendant la
# période d'inscription du 2026-09-16 au 2026-09-30 où l'app doit rester
# opérationnelle 24/24 ; à desserrer ensuite si besoin.
#
# Pas de `set -e` : les deux montages doivent être vérifiés même si le
# premier échoue.
set -uo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=lib/surveillance-ntfy.sh
source "$(dirname "$0")/lib/surveillance-ntfy.sh"

# Vérifie un montage, avec tentative de remount avant de rapporter l'échec.
verifier_montage() {
  local unite="$1" chemin_test="$2" libelle="$3"
  local fichier_test="$chemin_test/.oree-surveillance-$$"

  if timeout 10 touch "$fichier_test" 2>/dev/null; then
    rm -f "$fichier_test" 2>/dev/null
    rapporter_etat "nas-$unite" "NAS $libelle" 0
    return
  fi

  # Échec d'écriture : tentative de remount avant de rapporter l'état.
  local etait_deja_en_panne=0
  [ -f "$ETAT_DIR/nas-$unite.etat" ] && etait_deja_en_panne=1

  systemctl restart "$unite" >/dev/null 2>&1
  sleep 3
  if timeout 10 touch "$fichier_test" 2>/dev/null; then
    rm -f "$fichier_test" 2>/dev/null
    if [ "$etait_deja_en_panne" = 0 ]; then
      alerter "NAS $libelle : coupure brève auto-corrigée" "$unite a échoué une fois puis a été remonté automatiquement avec succès." "high" "warning"
    fi
    rapporter_etat "nas-$unite" "NAS $libelle" 0
    return
  fi

  rapporter_etat "nas-$unite" "NAS $libelle" 1
}

statut=0
verifier_montage "mnt-nas-Etudiant.mount" "/mnt/nas/Etudiant/etudiants" "Étudiant" || statut=1
verifier_montage "mnt-nas-Administration.mount" "/mnt/nas/Administration" "Administration" || statut=1
exit "$statut"
