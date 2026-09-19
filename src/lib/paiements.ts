import type {
  MoyenPaiement,
  StatutCheque,
  StatutPrelevement,
  TypeMouvement,
} from "@/generated/prisma/enums";
import { normaliserDateUTC } from "@/lib/presences";

export { MoyenPaiement, StatutCheque, StatutPrelevement, TypeMouvement } from "@/generated/prisma/enums";

export const MOYEN_LABELS: Record<MoyenPaiement, string> = {
  ESPECES: "Espèces",
  CHEQUE: "Chèque",
  VIREMENT: "Virement",
  CB: "Carte bancaire",
  PRELEVEMENT: "Prélèvement",
  VIREMENT_HELLOASSO: "Virement HelloAsso",
  PRELEVEMENT_HELLOASSO: "Prélèvement HelloAsso",
};

// Moyens dont le seul détail à saisir est un numéro de commande HelloAsso
// (voir Paiement.referenceHelloAsso) — pas de sous-table dédiée, contrairement
// à CHEQUE/PRELEVEMENT, ces deux moyens n'ayant ni statut ni autre champ à
// suivre (voir IncidentPaiement ci-dessous : ils sont définitifs à la saisie).
export const MOYENS_HELLOASSO: MoyenPaiement[] = ["VIREMENT_HELLOASSO", "PRELEVEMENT_HELLOASSO"];

// Décision associative du 2026-09-19 : les familles ne paient plus leur
// cotisation par virement/prélèvement/carte bancaires classiques, uniquement
// par HelloAsso (+ espèces/chèque en direct) pour l'instant — masqués du
// formulaire de saisie d'un paiement (voir ChampsMoyenPaiement,
// paiements/[id]/champs-moyen-paiement.tsx). Ne s'applique volontairement
// qu'à la saisie d'un Paiement de cotisation, jamais à MoyenPaiement en
// général : la Trésorerie (dépenses/recettes de l'association — loyer,
// salaires...) continue d'utiliser ces moyens, sans rapport avec HelloAsso.
export const MOYENS_COTISATION_DESACTIVES: MoyenPaiement[] = ["VIREMENT", "PRELEVEMENT", "CB"];

export const STATUT_CHEQUE_LABELS: Record<StatutCheque, string> = {
  RECU: "Reçu",
  DEPOSE: "Déposé",
  ENCAISSE: "Encaissé",
  REJETE: "Rejeté",
};

// Même principe que STATUT_CHEQUE_LABELS, sans étape de dépôt physique (voir
// Prelevement.statut, prisma/schema.prisma).
export const STATUT_PRELEVEMENT_LABELS: Record<StatutPrelevement, string> = {
  EMIS: "Émis",
  ENCAISSE: "Encaissé",
  REJETE: "Rejeté",
};

// Incident de paiement : chèque impayé (Cheque.statut = REJETE) ou
// prélèvement rejeté (Prelevement.statut = REJETE) — les deux seuls moyens
// ayant une sous-table dédiée, donc les deux seuls pouvant échouer après coup
// (espèces/CB/virement/virement+prélèvement HelloAsso sont considérés
// définitifs à la saisie).
export type IncidentPaiement = { type: "CHEQUE" | "PRELEVEMENT"; motif: string | null };

export const INCIDENT_LABELS: Record<IncidentPaiement["type"], string> = {
  CHEQUE: "Chèque impayé",
  PRELEVEMENT: "Prélèvement rejeté",
};

export function incidentDePaiement(paiement: {
  cheque?: { statut: StatutCheque; motifRejet: string | null } | null;
  prelevement?: { statut: StatutPrelevement; motifRejet: string | null } | null;
}): IncidentPaiement | null {
  if (paiement.cheque && paiement.cheque.statut === "REJETE") {
    return { type: "CHEQUE", motif: paiement.cheque.motifRejet };
  }
  if (paiement.prelevement && paiement.prelevement.statut === "REJETE") {
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
  prelevement?: { statut: StatutPrelevement } | null;
};

// Un chèque impayé ou un prélèvement rejeté n'a jamais été réellement
// encaissé (voir mettreAJourChequeAction / mettreAJourPrelevementAction,
// paiements/[id]/actions.ts) : il ne doit plus jamais compter dans un total
// encaissé, sans quoi un dossier/une échéance reste affiché "Soldé" à tort.
// Centralisé ici pour que dossier, échéance et export CSV restent cohérents.
export function totalEncaisse(paiements: PaiementPourEncaisse[]): number {
  return paiements
    .filter((p) => p.cheque?.statut !== "REJETE" && p.prelevement?.statut !== "REJETE")
    .reduce((total, p) => total + Number.parseFloat(p.montant.toString()), 0);
}

// Décision associative du 2026-09-19 : un chèque/prélèvement remis à
// l'avance pour une échéance future (paiement en plusieurs fois, ex. 3
// chèques postdatés déposés d'un coup à l'inscription) est bien "reçu" dès
// sa saisie — voir totalEncaisse, utilisé tel quel pour l'affichage propre à
// CETTE échéance — mais n'est pas de l'argent réellement disponible en
// trésorerie avant la date prévue. Une échéance n'est donc "arrivée à
// échéance" que le jour J (inclus), jamais avant.
export function echeanceArrivee(dateEcheance: Date, aujourdHui: Date = new Date()): boolean {
  return normaliserDateUTC(dateEcheance).getTime() <= normaliserDateUTC(aujourdHui).getTime();
}

// Total encaissé "mature" : ne compte que les échéances déjà arrivées à
// échéance (voir echeanceArrivee ci-dessus) — c'est ce total, et non
// totalEncaisse() en brut, qui doit alimenter le solde global d'un dossier
// (statutCotisation) : un dossier ne doit jamais apparaître "Soldé" grâce à
// des chèques postdatés dont l'échéance n'est pas encore passée.
export function totalEncaisseMature(
  echeances: { dateEcheance: Date; paiements: PaiementPourEncaisse[] }[],
  aujourdHui: Date = new Date(),
): number {
  return totalEncaisse(
    echeances.filter((e) => echeanceArrivee(e.dateEcheance, aujourdHui)).flatMap((e) => e.paiements),
  );
}

// Statut de cotisation d'un dossier annuel : calculé à partir du dû et de
// l'encaissé MATURE (voir totalEncaisseMature — les échéances futures déjà
// payées n'y comptent pas encore), sauf "Remboursé" qui prime (basculé
// manuellement, voir DossierAnnuel.rembourse) et "Gratuit" quand aucun
// montant n'est dû.
export function statutCotisation(
  dossier: {
    montantDu: { toString(): string };
    rembourse?: boolean;
    echeances: { dateEcheance: Date; paiements: PaiementPourEncaisse[] }[];
  },
  aujourdHui: Date = new Date(),
): { du: number; encaisse: number; reste: number; statut: StatutCotisation } {
  const du = Number.parseFloat(dossier.montantDu.toString());
  const encaisse = totalEncaisseMature(dossier.echeances, aujourdHui);
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
