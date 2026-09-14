import { ajouterJoursUTC } from "@/lib/calendrier";

// Ramène une date à sa clé de jour calendaire LOCAL (même convention que
// aujourdhuiUTC, voir lib/presences.ts) : deux horodatages du même jour
// local partagent la même clé, quelle que soit l'heure — nécessaire car les
// horodatages groupés ici (Paiement.creeLe, Seance.valideeLe, ...) portent
// une heure précise, jamais minuit.
function cleJourLocal(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

// Fenêtre de jours (clé de jour local -> 0) se terminant à `aujourdhui`
// inclus, en ordre chronologique croissant — c'est cet ordre que
// <Sparkline> (components/ui/sparkline.tsx) attend pour tracer la courbe de
// gauche (le plus ancien) à droite (aujourd'hui).
function fenetreVide(nbJours: number, aujourdhui: Date): Map<number, number> {
  const buckets = new Map<number, number>();
  for (let i = nbJours - 1; i >= 0; i--) {
    buckets.set(cleJourLocal(ajouterJoursUTC(aujourdhui, -i)), 0);
  }
  return buckets;
}

/**
 * Compte le nombre d'horodatages tombant sur chaque jour d'une fenêtre de
 * `nbJours` jours se terminant à `aujourdhui` (inclus) — un horodatage hors
 * fenêtre est ignoré plutôt que de faire échouer le calcul (l'appelant peut
 * élargir sa requête par prudence sans fausser le graphique).
 */
export function serieQuotidienne(horodatages: Date[], nbJours: number, aujourdhui: Date): number[] {
  const buckets = fenetreVide(nbJours, aujourdhui);
  for (const date of horodatages) {
    const cle = cleJourLocal(date);
    if (buckets.has(cle)) buckets.set(cle, (buckets.get(cle) ?? 0) + 1);
  }
  return Array.from(buckets.values());
}

/** Même principe que serieQuotidienne, mais somme une valeur (ex. le montant d'un paiement) au lieu de compter les occurrences. */
export function sommeQuotidienne(
  evenements: { date: Date; valeur: number }[],
  nbJours: number,
  aujourdhui: Date,
): number[] {
  const buckets = fenetreVide(nbJours, aujourdhui);
  for (const { date, valeur } of evenements) {
    const cle = cleJourLocal(date);
    if (buckets.has(cle)) buckets.set(cle, (buckets.get(cle) ?? 0) + valeur);
  }
  return Array.from(buckets.values());
}
