import type {
  MoyenPaiement,
  StatutCheque,
  TypeMouvement,
} from "@/generated/prisma/enums";

export { MoyenPaiement, StatutCheque, TypeMouvement } from "@/generated/prisma/enums";

export const MOYEN_LABELS: Record<MoyenPaiement, string> = {
  ESPECES: "Espèces",
  CHEQUE: "Chèque",
  VIREMENT: "Virement",
  CB: "Carte bancaire",
  PRELEVEMENT: "Prélèvement",
};

export const STATUT_CHEQUE_LABELS: Record<StatutCheque, string> = {
  RECU: "Reçu",
  DEPOSE: "Déposé",
  ENCAISSE: "Encaissé",
  REJETE: "Rejeté",
};

// Incident de paiement : chèque impayé (Cheque.statut = REJETE) ou
// prélèvement rejeté (Prelevement.rejete) — les deux seuls moyens ayant une
// sous-table dédiée, donc les deux seuls pouvant échouer après coup
// (espèces/CB/virement sont considérés définitifs à la saisie).
export type IncidentPaiement = { type: "CHEQUE" | "PRELEVEMENT"; motif: string | null };

export const INCIDENT_LABELS: Record<IncidentPaiement["type"], string> = {
  CHEQUE: "Chèque impayé",
  PRELEVEMENT: "Prélèvement rejeté",
};

export function incidentDePaiement(paiement: {
  cheque?: { statut: StatutCheque; motifRejet: string | null } | null;
  prelevement?: { rejete: boolean; motifRejet: string | null } | null;
}): IncidentPaiement | null {
  if (paiement.cheque && paiement.cheque.statut === "REJETE") {
    return { type: "CHEQUE", motif: paiement.cheque.motifRejet };
  }
  if (paiement.prelevement?.rejete) {
    return { type: "PRELEVEMENT", motif: paiement.prelevement.motifRejet };
  }
  return null;
}

export const TYPE_MOUVEMENT_LABELS: Record<TypeMouvement, string> = {
  RECETTE: "Recette",
  DEPENSE: "Dépense",
};

export function formaterMontant(montant: number | string): string {
  const valeur = typeof montant === "string" ? Number.parseFloat(montant) : montant;
  return valeur.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

export type StatutCotisation = "Gratuit" | "Soldé" | "Partiel" | "Impayé" | "Remboursé";

export const STATUT_COTISATION_VARIANTS: Record<
  StatutCotisation,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  Gratuit: "info",
  Soldé: "success",
  Partiel: "warning",
  Impayé: "danger",
  Remboursé: "neutral",
};

// Teinte de ligne (liste Paiements) : même code couleur que le badge de
// statut, en repère additionnel pour un scan visuel rapide sur une longue
// liste — le badge reste affiché à côté, jamais remplacé (accessibilité :
// la couleur seule ne doit jamais porter l'information).
export const STATUT_COTISATION_ROW_CLASSES: Record<StatutCotisation, string> = {
  Gratuit: "border-l-4 border-l-sky bg-sky-bg/25",
  Soldé: "border-l-4 border-l-sage bg-sage-bg/25",
  Partiel: "border-l-4 border-l-ochre bg-ochre-bg/25",
  Impayé: "border-l-4 border-l-rust bg-rust-bg/25",
  Remboursé: "border-l-4 border-l-border-strong bg-bg-sunken/40",
};

type PaiementPourEncaisse = {
  montant: { toString(): string };
  cheque?: { statut: StatutCheque } | null;
  prelevement?: { rejete: boolean } | null;
};

// Un chèque impayé ou un prélèvement rejeté n'a jamais été réellement
// encaissé (voir mettreAJourChequeAction / mettreAJourPrelevementAction,
// paiements/[id]/actions.ts) : il ne doit plus jamais compter dans un total
// encaissé, sans quoi un dossier/une échéance reste affiché "Soldé" à tort.
// Centralisé ici pour que dossier, échéance et export CSV restent cohérents.
export function totalEncaisse(paiements: PaiementPourEncaisse[]): number {
  return paiements
    .filter((p) => p.cheque?.statut !== "REJETE" && !p.prelevement?.rejete)
    .reduce((total, p) => total + Number.parseFloat(p.montant.toString()), 0);
}

// Statut de cotisation d'un dossier annuel : calculé à partir du dû et de
// l'encaissé, sauf "Remboursé" qui prime (basculé manuellement, voir
// DossierAnnuel.rembourse) et "Gratuit" quand aucun montant n'est dû.
export function statutCotisation(dossier: {
  montantDu: { toString(): string };
  rembourse?: boolean;
  echeances: { paiements: PaiementPourEncaisse[] }[];
}): { du: number; encaisse: number; reste: number; statut: StatutCotisation } {
  const du = Number.parseFloat(dossier.montantDu.toString());
  const encaisse = totalEncaisse(dossier.echeances.flatMap((e) => e.paiements));
  const reste = du - encaisse;
  const statut: StatutCotisation = dossier.rembourse
    ? "Remboursé"
    : du === 0
      ? "Gratuit"
      : reste <= 0
        ? "Soldé"
        : encaisse > 0
          ? "Partiel"
          : "Impayé";
  return { du, encaisse, reste, statut };
}
