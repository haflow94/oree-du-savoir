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
  },
  {
    nom: "Langue Arabe",
    fraisFormation: "490.00",
    fraisDossier: "60.00",
    volumeHoraireAnnuel: 120,
    remboursementAvant15Jours: 50,
    remboursementAvant29Jours: 25,
  },
  {
    nom: "Études Coraniques",
    fraisFormation: "440.00",
    fraisDossier: "60.00",
    volumeHoraireAnnuel: 120,
    remboursementAvant15Jours: 50,
    remboursementAvant29Jours: 25,
  },
  {
    nom: "Études Islamiques",
    fraisFormation: "520.00",
    fraisDossier: "60.00",
    volumeHoraireAnnuel: 120,
    remboursementAvant15Jours: 50,
    remboursementAvant29Jours: 25,
  },
] as const;
