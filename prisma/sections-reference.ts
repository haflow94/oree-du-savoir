// Référentiel des 4 sections de l'association, repris des dossiers
// d'inscription papier 2025-2026 (Projet/Dossiers-inscriptions). Ces
// documents ne sont pas définitifs (logo/nom association à ajouter) mais la
// tarification et les horaires qu'ils indiquent sont les données réelles.
//
// Barème de remboursement en cas d'annulation après le début des cours :
// avant15Jours = % remboursé entre le 1er et le 15e jour après le début,
// avant29Jours = % remboursé entre le 15e et le 29e jour. Avant le début
// des cours c'est 100% (implicite), après le 29e jour c'est 0% (implicite).
export const SECTIONS_REFERENCE = [
  {
    nom: "Jeunes",
    fraisFormation: "420.00",
    fraisDossier: "60.00",
    volumeHoraireAnnuel: 93,
    remboursementAvant15Jours: 75,
    remboursementAvant29Jours: 50,
    modeleDossier: "JEUNES",
  },
  {
    nom: "Langue Arabe",
    fraisFormation: "490.00",
    fraisDossier: "60.00",
    volumeHoraireAnnuel: 120,
    remboursementAvant15Jours: 50,
    remboursementAvant29Jours: 25,
    modeleDossier: "ADULTES",
  },
  {
    nom: "Études Coraniques",
    fraisFormation: "440.00",
    fraisDossier: "60.00",
    volumeHoraireAnnuel: 120,
    remboursementAvant15Jours: 50,
    remboursementAvant29Jours: 25,
    modeleDossier: "ADULTES",
  },
  {
    nom: "Études Islamiques",
    fraisFormation: "520.00",
    fraisDossier: "60.00",
    volumeHoraireAnnuel: 120,
    remboursementAvant15Jours: 50,
    remboursementAvant29Jours: 25,
    modeleDossier: "ADULTES",
  },
] as const;

// Catalogue des créneaux affichés sur le dossier d'inscription de chaque
// section (voir modèle CreneauSection et SPEC-dossiers.md §1 — reprend les
// horaires et restrictions des 4 dossiers Word d'origine). Donnée de
// catalogue, distincte du planning réel (Classe.jour/heureDebut/heureFin).
export const CRENEAUX_REFERENCE: Record<
  string,
  { code: string; jour: string; horaire: string; restriction?: string; ordre: number }[]
> = {
  Jeunes: [{ code: "D", jour: "Dimanche", horaire: "13h30 – 16h30", ordre: 0 }],
  "Langue Arabe": [
    { code: "CS", jour: "mardi et jeudi", horaire: "19h00 – 21h00", restriction: "Seulement Niveau 1", ordre: 0 },
    { code: "S", jour: "Samedi", horaire: "09h00 – 13h00", ordre: 1 },
    { code: "D", jour: "Dimanche", horaire: "14h00 – 18h00", ordre: 2 },
  ],
  "Études Coraniques": [
    { code: "CS", jour: "mardi et jeudi", horaire: "19h00 – 21h00", ordre: 0 },
    { code: "S", jour: "Samedi", horaire: "09h00 – 13h00", ordre: 1 },
    { code: "D", jour: "Dimanche", horaire: "09h00 – 13h00", ordre: 2 },
  ],
  "Études Islamiques": [
    { code: "CS", jour: "mardi et jeudi", horaire: "19h00 – 21h00", restriction: "Seulement 1ʳᵉ année", ordre: 0 },
    { code: "S", jour: "Samedi", horaire: "09h00 – 13h00", ordre: 1 },
    { code: "D", jour: "Dimanche", horaire: "09h00 – 13h00", ordre: 2 },
  ],
};
