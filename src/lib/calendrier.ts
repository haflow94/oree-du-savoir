import { aujourdhuiUTC, normaliserDateUTC } from "@/lib/presences";

export { aujourdhuiUTC, normaliserDateUTC };

// "salles" : planning hebdomadaire récurrent (jour+heure de chaque Classe),
// pas une plage de dates comme les 4 autres vues — voir decalerDate ci-dessous
// et (app)/calendrier/page.tsx, qui masque la navigation jour/semaine/mois
// précédent-suivant pour cette vue.
export type VueCalendrier = "jour" | "semaine" | "mois" | "annee" | "salles";

export const VUES_CALENDRIER: VueCalendrier[] = ["jour", "semaine", "mois", "annee", "salles"];

export const VUE_LABELS: Record<VueCalendrier, string> = {
  jour: "Jour",
  semaine: "Semaine",
  mois: "Mois",
  annee: "Année",
  salles: "Salles",
};

export function estVueCalendrier(valeur: string | undefined): valeur is VueCalendrier {
  return (
    valeur === "jour" ||
    valeur === "semaine" ||
    valeur === "mois" ||
    valeur === "annee" ||
    valeur === "salles"
  );
}

export function ajouterJoursUTC(date: Date, jours: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + jours);
  return d;
}

// Lundi de la semaine UTC contenant `date` (même convention que
// src/lib/planning.ts : JOURS_ORDONNES commence au lundi).
export function debutSemaineUTC(date: Date): Date {
  const d = normaliserDateUTC(date);
  const decalage = (d.getUTCDay() + 6) % 7;
  return ajouterJoursUTC(d, -decalage);
}

export function debutMoisUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function ajouterMoisUTC(date: Date, mois: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + mois, 1));
}

export function finMoisUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

export function debutAnneeUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

export function ajouterAnneesUTC(date: Date, annees: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + annees, 0, 1));
}

export function finAnneeUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 11, 31));
}

// Grille de semaines complètes (lundi→dimanche) couvrant le mois de `date`,
// avec les jours des mois voisins nécessaires pour compléter les lignes
// (affichés estompés côté page).
export function grilleMoisUTC(date: Date): Date[][] {
  const debutGrille = debutSemaineUTC(debutMoisUTC(date));
  const finGrille = ajouterJoursUTC(debutSemaineUTC(finMoisUTC(date)), 6);

  const semaines: Date[][] = [];
  let curseur = debutGrille;
  while (curseur.getTime() <= finGrille.getTime()) {
    const semaine: Date[] = [];
    for (let i = 0; i < 7; i++) {
      semaine.push(curseur);
      curseur = ajouterJoursUTC(curseur, 1);
    }
    semaines.push(semaine);
  }
  return semaines;
}

export function memeJourUTC(a: Date, b: Date): boolean {
  return normaliserDateUTC(a).getTime() === normaliserDateUTC(b).getTime();
}

export function versParamDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function depuisParamDate(valeur: string | undefined): Date | null {
  if (!valeur) return null;
  const d = new Date(`${valeur}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : normaliserDateUTC(d);
}

// Date de référence après un déplacement (précédent/suivant/aujourd'hui)
// selon l'échelle affichée : un pas de semaine en vue semaine, de mois en
// vue mois, etc.
export function decalerDate(date: Date, vue: VueCalendrier, sens: 1 | -1): Date {
  switch (vue) {
    case "jour":
      return ajouterJoursUTC(date, sens);
    case "semaine":
      return ajouterJoursUTC(date, sens * 7);
    case "mois":
      return ajouterMoisUTC(debutMoisUTC(date), sens);
    case "annee":
      return ajouterAnneesUTC(debutAnneeUTC(date), sens);
    case "salles":
      // Planning récurrent, sans navigation par date (voir le type ci-dessus).
      return date;
  }
}

// Range une activité sur chaque jour de son éventuelle plage [date, dateFin]
// plutôt que sur sa seule date de début : un camp de 3 jours doit apparaître
// les 3 jours sur le calendrier. Partagé entre /calendrier et la vue
// calendrier de /activites.
export function activitesParJourAvecPlage<T extends { date: Date; dateFin: Date | null }>(
  activites: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const a of activites) {
    let curseur = normaliserDateUTC(a.date);
    const fin = a.dateFin ? normaliserDateUTC(a.dateFin) : curseur;
    while (curseur <= fin) {
      const cle = versParamDate(curseur);
      const liste = map.get(cle) ?? [];
      liste.push(a);
      map.set(cle, liste);
      curseur = ajouterJoursUTC(curseur, 1);
    }
  }
  return map;
}

export const MOIS_LABELS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
