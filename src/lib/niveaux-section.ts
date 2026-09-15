import type { CatalogueNiveaux } from "@/generated/prisma/enums";

// Options affichées (préinscription, fiche étudiant) pour chaque catalogue de
// niveaux — voir Section.catalogueNiveaux dans prisma/schema.prisma. Le choix
// associatif porte sur QUEL catalogue s'applique à une section (Administration
// → Sections), jamais sur le contenu d'un catalogue lui-même, d'où une liste
// figée ici plutôt qu'une table éditable.
export const NIVEAUX_PAR_CATALOGUE: Record<CatalogueNiveaux, string[]> = {
  AUCUN: [],
  DEBUTANT_INTERMEDIAIRE: ["Débutant", "Intermédiaire"],
  ANNEES_1_A_5: ["1ère année", "2ème année", "3ème année", "4ème année", "5ème année"],
};

// Libellés utilisés dans le sélecteur d'édition d'une section (Administration
// → Sections).
export const LABEL_CATALOGUE_NIVEAUX: Record<CatalogueNiveaux, string> = {
  AUCUN: "Aucun (pas de niveau à préciser)",
  DEBUTANT_INTERMEDIAIRE: "Débutant / Intermédiaire",
  ANNEES_1_A_5: "1ère à 5ème année",
};
