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
