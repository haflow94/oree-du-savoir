import { FrequenceActivite } from "@/generated/prisma/enums";
import { aujourdhuiUTC, ajouterJoursUTC, normaliserDateUTC } from "@/lib/calendrier";

// Logique pure (pas d'import Prisma) volontairement séparée de
// lib/activites.ts : ce module est importé depuis des composants client
// (activite-dialog.tsx, activite-row.tsx), qui planteraient au build s'ils
// tiraient `pg`/Prisma dans le bundle navigateur. Même principe que la
// séparation enseignants.ts (serveur) / enseignants-section.ts (pur).
export { FrequenceActivite };

// "2 ou 3 semaines avant l'événement" (retenu au tableau de bord et à la
// pastille du menu) : rappel géré entièrement par l'application, sans email
// ni dépendance à n8n (règle non négociable, voir
// Projet/04_Regles_non_negociables.md et le modèle Activite).
export const RAPPEL_JOURS = 21;

export const FREQUENCE_LABELS: Record<FrequenceActivite, string> = {
  AUCUNE: "Ne se répète pas",
  QUOTIDIENNE: "Tous les jours",
  HEBDOMADAIRE: "Toutes les semaines",
  MENSUELLE: "Tous les mois",
};

// Nombre d'occurrences maximum générées pour une série récurrente : borne de
// sécurité pour éviter qu'une date de fin de récurrence saisie trop
// lointaine (ou une faute de frappe d'année) ne crée des milliers de lignes
// Activite d'un coup. Largement suffisant pour un usage associatif (ex. 200
// semaines ≈ presque 4 ans d'une activité hebdomadaire).
export const MAX_OCCURRENCES_SERIE = 200;

function ajouterMoisEnPreservantJour(date: Date, mois: number): Date {
  const jour = date.getUTCDate();
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + mois, 1));
  const dernierJourDuMois = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(jour, dernierJourDuMois));
  return d;
}

export function diffJoursUTC(a: Date, b: Date): number {
  const MS_PAR_JOUR = 24 * 60 * 60 * 1000;
  return Math.round((normaliserDateUTC(a).getTime() - normaliserDateUTC(b).getTime()) / MS_PAR_JOUR);
}

// Dates des occurrences d'une (éventuelle) série récurrente, en partant de
// `date`. AUCUNE ou pas de date de fin de récurrence renseignée → une seule
// occurrence (l'activité ponctuelle telle que saisie). Borné par
// MAX_OCCURRENCES_SERIE (voir sa doc).
export function datesOccurrencesActivite(
  date: Date,
  frequence: FrequenceActivite,
  dateFinRecurrence: Date | null,
): Date[] {
  const debut = normaliserDateUTC(date);
  if (frequence === FrequenceActivite.AUCUNE || !dateFinRecurrence) return [debut];

  const fin = normaliserDateUTC(dateFinRecurrence);
  const dates: Date[] = [];
  // Chaque occurrence recalculée depuis `debut` (pas depuis la précédente) :
  // sinon un mois plus court que le jour d'ancrage (ex. 31 janvier → 28
  // février) ferait dériver définitivement les mois suivants vers le 28 au
  // lieu de revenir au 31 dès qu'un mois de 31 jours repasse.
  for (let n = 0; dates.length < MAX_OCCURRENCES_SERIE; n++) {
    const occurrence =
      frequence === FrequenceActivite.QUOTIDIENNE
        ? ajouterJoursUTC(debut, n)
        : frequence === FrequenceActivite.HEBDOMADAIRE
          ? ajouterJoursUTC(debut, n * 7)
          : ajouterMoisEnPreservantJour(debut, n);
    if (occurrence > fin) break;
    dates.push(occurrence);
  }
  return dates;
}

export function activiteDansFenetreDeRappel(date: Date, aujourdhui: Date = aujourdhuiUTC()): boolean {
  const fin = ajouterJoursUTC(aujourdhui, RAPPEL_JOURS);
  return date >= aujourdhui && date <= fin;
}
