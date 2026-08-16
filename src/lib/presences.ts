import type { StatutPresence, StatutSeance } from "@/generated/prisma/enums";
import type { JourSemaine } from "@/generated/prisma/enums";
import { JOURS_ORDONNES } from "@/lib/planning";

export { StatutPresence, StatutSeance } from "@/generated/prisma/enums";

// Libellés longs pour l'écran, codes courts pour la feuille papier : ce sont
// les codes déjà utilisés par l'association (Modele présence.xlsx).
export const STATUT_PRESENCE_LABELS: Record<StatutPresence, string> = {
  PRESENT: "Présent",
  RETARD: "Retard",
  RETARD_EXCUSE: "Retard excusé",
  ABSENT: "Absent",
  ABSENT_EXCUSE: "Absent excusé",
};

export const STATUT_PRESENCE_CODES: Record<StatutPresence, string> = {
  PRESENT: "P",
  RETARD: "R",
  RETARD_EXCUSE: "RE",
  ABSENT: "A",
  ABSENT_EXCUSE: "AE",
};

export const STATUT_SEANCE_LABELS: Record<StatutSeance, string> = {
  PREVUE: "Prévue",
  VALIDEE: "Validée",
  ANNULEE: "Annulée",
};

/**
 * Jour courant selon l'horloge locale, ramené à minuit UTC pour être
 * comparable aux colonnes `@db.Date`. Getters locaux volontaires : on veut
 * la date que voit l'utilisateur, pas celle du méridien de Greenwich.
 */
export function aujourdhuiUTC(maintenant: Date = new Date()): Date {
  return new Date(
    Date.UTC(
      maintenant.getFullYear(),
      maintenant.getMonth(),
      maintenant.getDate(),
    ),
  );
}

/**
 * Ramène une date déjà stockée (donc en UTC) à minuit UTC. Getters UTC
 * volontaires : utiliser des getters locaux décalerait d'un jour selon le
 * fuseau du serveur.
 */
export function normaliserDateUTC(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function jourSemaineDe(date: Date): JourSemaine {
  // getUTCDay() : 0 = dimanche. JOURS_ORDONNES commence au lundi.
  const index = (date.getUTCDay() + 6) % 7;
  return JOURS_ORDONNES[index];
}

/**
 * Dates des séances hebdomadaires d'une classe sur une période, en sautant
 * les périodes de fermeture (vacances). Les séances ponctuellement annulées
 * sont gérées séparément, sur la séance elle-même.
 */
export function datesDesSeances(
  jour: JourSemaine,
  debut: Date,
  fin: Date,
  fermetures: Array<{ dateDebut: Date; dateFin: Date }>,
): Date[] {
  const dates: Date[] = [];
  const curseur = normaliserDateUTC(debut);
  const derniere = normaliserDateUTC(fin);
  const bornesFermeture = fermetures.map((f) => ({
    debut: normaliserDateUTC(f.dateDebut),
    fin: normaliserDateUTC(f.dateFin),
  }));

  while (curseur <= derniere) {
    if (jourSemaineDe(curseur) === jour) {
      const dansFermeture = bornesFermeture.some(
        (f) => curseur >= f.debut && curseur <= f.fin,
      );
      if (!dansFermeture) {
        dates.push(new Date(curseur));
      }
    }
    curseur.setUTCDate(curseur.getUTCDate() + 1);
  }

  return dates;
}

/**
 * L'enseignant peut corriger sa saisie jusqu'à la fin de la journée de la
 * séance (décision validée avec l'association) ; au-delà, seule
 * l'administration corrige.
 */
export function enseignantPeutCorriger(
  dateSeance: Date,
  maintenant: Date = new Date(),
): boolean {
  return aujourdhuiUTC(maintenant).getTime() <= normaliserDateUTC(dateSeance).getTime();
}
