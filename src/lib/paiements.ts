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

// Statut de cotisation d'un dossier annuel : calculé à partir du dû et de
// l'encaissé, sauf "Remboursé" qui prime (basculé manuellement, voir
// DossierAnnuel.rembourse) et "Gratuit" quand aucun montant n'est dû.
export function statutCotisation(dossier: {
  montantDu: { toString(): string };
  rembourse?: boolean;
  echeances: { paiements: { montant: { toString(): string } }[] }[];
}): { du: number; encaisse: number; reste: number; statut: StatutCotisation } {
  const du = Number.parseFloat(dossier.montantDu.toString());
  const encaisse = dossier.echeances
    .flatMap((e) => e.paiements)
    .reduce((total, p) => total + Number.parseFloat(p.montant.toString()), 0);
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
