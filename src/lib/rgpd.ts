// Logique pure (pas de Prisma) — reste importable depuis un test ou un
// composant client. La requête base de données vit dans
// lib/rgpd-eligibles.ts, qui réutilise ces fonctions.

// Durée de rétention haute (voir mention RGPD affichée à la préinscription) :
// au-delà, un dossier sans lien avec l'association devient éligible à une
// anonymisation manuelle. Pas de purge automatique tant que le CA n'a pas
// validé de politique formelle — voir Administration > RGPD.
export const SEUIL_ANNEES_INACTIVITE = 5;

export type EtudiantAvecDossiers = {
  anonymiseLe: Date | null;
  creeLe: Date;
  dossiersAnnuels: { anneeScolaire: { dateFin: Date } }[];
};

// Dernier point de contact connu avec l'association : la fin de l'année
// scolaire du dossier annuel le plus récent, ou à défaut la création de la
// fiche (cas d'une préinscription jamais confirmée).
export function dateFinParcours(etudiant: EtudiantAvecDossiers): Date {
  return etudiant.dossiersAnnuels.reduce(
    (plusRecente, d) =>
      d.anneeScolaire.dateFin > plusRecente ? d.anneeScolaire.dateFin : plusRecente,
    etudiant.creeLe,
  );
}

export function estEligibleAnonymisation(
  etudiant: EtudiantAvecDossiers,
  aujourdhui: Date = new Date(),
): boolean {
  if (etudiant.anonymiseLe) return false;
  const seuil = new Date(aujourdhui);
  seuil.setFullYear(seuil.getFullYear() - SEUIL_ANNEES_INACTIVITE);
  return dateFinParcours(etudiant) < seuil;
}
