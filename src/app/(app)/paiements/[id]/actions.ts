"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MoyenPaiement, StatutCheque } from "@/generated/prisma/enums";
import { Role } from "@/lib/roles";

const PEUT_SAISIR = [Role.ACCUEIL, Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU];
const PEUT_GERER_CHEQUE = [Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU];

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

export async function ajouterEcheanceAction(formData: FormData): Promise<void> {
  await requireRole(PEUT_SAISIR);

  const dossierAnnuelId = champTexte(formData, "dossierAnnuelId");
  const montant = champTexte(formData, "montant");
  const dateEcheance = champTexte(formData, "dateEcheance");
  if (!dossierAnnuelId || !montant || !dateEcheance) return;

  await prisma.echeance.create({
    data: {
      dossierAnnuelId,
      montant,
      dateEcheance: new Date(dateEcheance),
      libelle: champTexte(formData, "libelle"),
    },
  });

  revalidatePath(`/paiements/${dossierAnnuelId}`);
}

export async function enregistrerPaiementAction(formData: FormData): Promise<void> {
  const session = await requireRole(PEUT_SAISIR);

  const echeanceId = champTexte(formData, "echeanceId");
  const montant = champTexte(formData, "montant");
  const moyenBrut = champTexte(formData, "moyen");
  if (!echeanceId || !montant || !moyenBrut || !(moyenBrut in MoyenPaiement)) {
    return;
  }
  const moyen = moyenBrut as MoyenPaiement;

  const echeance = await prisma.echeance.findUnique({ where: { id: echeanceId } });
  if (!echeance) return;

  const paiement = await prisma.paiement.create({
    data: {
      echeanceId,
      montant,
      moyen,
      ...(moyen === "CHEQUE"
        ? {
            cheque: {
              create: {
                banque: champTexte(formData, "chequeBanque"),
                numero: champTexte(formData, "chequeNumero"),
                titulaire: champTexte(formData, "chequeTitulaire"),
              },
            },
          }
        : {}),
      ...(moyen === "PRELEVEMENT"
        ? {
            prelevement: {
              create: {
                iban: champTexte(formData, "prelevementIban"),
                bic: champTexte(formData, "prelevementBic"),
                titulaire: champTexte(formData, "prelevementTitulaire"),
                referenceMandat: champTexte(formData, "prelevementReferenceMandat"),
              },
            },
          }
        : {}),
    },
  });

  await prisma.journalAudit.create({
    data: {
      utilisateurId: session.id,
      action: "saisie_paiement",
      entite: "Paiement",
      entiteId: paiement.id,
    },
  });

  revalidatePath(`/paiements/${echeance.dossierAnnuelId}`);
  revalidatePath("/paiements");
}

export async function modifierEcheanceAction(formData: FormData): Promise<void> {
  const session = await requireRole(PEUT_GERER_CHEQUE);

  const echeanceId = champTexte(formData, "echeanceId");
  const montant = champTexte(formData, "montant");
  const dateEcheance = champTexte(formData, "dateEcheance");
  if (!echeanceId || !montant || !dateEcheance) return;

  const cible = await prisma.echeance.findUnique({ where: { id: echeanceId } });
  if (!cible) return;

  await prisma.$transaction([
    prisma.echeance.update({
      where: { id: echeanceId },
      data: {
        montant,
        dateEcheance: new Date(dateEcheance),
        libelle: champTexte(formData, "libelle"),
      },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_echeance",
        entite: "Echeance",
        entiteId: echeanceId,
        details: { avant: cible.montant.toString(), apres: montant },
      },
    }),
  ]);

  // Le dossier réellement modifié est celui de l'échéance elle-même, pas la
  // valeur (potentiellement obsolète/manipulée) soumise par le formulaire.
  revalidatePath(`/paiements/${cible.dossierAnnuelId}`);
}

export async function supprimerEcheanceAction(formData: FormData): Promise<void> {
  const session = await requireRole(PEUT_GERER_CHEQUE);

  const echeanceId = champTexte(formData, "echeanceId");
  if (!echeanceId) return;

  const cible = await prisma.echeance.findUnique({
    where: { id: echeanceId },
    include: { _count: { select: { paiements: true } } },
  });
  if (!cible) return;

  // Un paiement déjà encaissé sur cette échéance implique une écriture
  // financière déjà constituée : on refuse la suppression plutôt que de la
  // faire disparaître silencieusement (voir modifierPaiementAction pour
  // corriger un paiement, ou saisir un mouvement compensatoire).
  if (cible._count.paiements > 0) return;

  await prisma.$transaction([
    prisma.echeance.delete({ where: { id: echeanceId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_echeance",
        entite: "Echeance",
        entiteId: echeanceId,
        details: { montant: cible.montant.toString() },
      },
    }),
  ]);

  revalidatePath(`/paiements/${cible.dossierAnnuelId}`);
}

export async function modifierMontantDuAction(formData: FormData): Promise<void> {
  const session = await requireRole(PEUT_GERER_CHEQUE);

  const dossierAnnuelId = champTexte(formData, "dossierAnnuelId");
  const montantDu = champTexte(formData, "montantDu");
  if (!dossierAnnuelId || !montantDu) return;

  const cible = await prisma.dossierAnnuel.findUnique({ where: { id: dossierAnnuelId } });
  if (!cible) return;

  await prisma.$transaction([
    prisma.dossierAnnuel.update({
      where: { id: dossierAnnuelId },
      data: { montantDu },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_montant_du",
        entite: "DossierAnnuel",
        entiteId: dossierAnnuelId,
        details: { avant: cible.montantDu.toString(), apres: montantDu },
      },
    }),
  ]);

  revalidatePath(`/paiements/${dossierAnnuelId}`);
  revalidatePath("/paiements");
}

export async function modifierPaiementAction(formData: FormData): Promise<void> {
  const session = await requireRole(PEUT_GERER_CHEQUE);

  const paiementId = champTexte(formData, "paiementId");
  const montant = champTexte(formData, "montant");
  if (!paiementId || !montant) return;

  const cible = await prisma.paiement.findUnique({
    where: { id: paiementId },
    include: { echeance: true },
  });
  if (!cible) return;

  await prisma.$transaction([
    prisma.paiement.update({ where: { id: paiementId }, data: { montant } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_paiement",
        entite: "Paiement",
        entiteId: paiementId,
        details: { avant: cible.montant.toString(), apres: montant },
      },
    }),
  ]);

  revalidatePath(`/paiements/${cible.echeance.dossierAnnuelId}`);
  revalidatePath("/paiements");
}

export async function mettreAJourChequeAction(formData: FormData): Promise<void> {
  await requireRole(PEUT_GERER_CHEQUE);

  const chequeId = champTexte(formData, "chequeId");
  const statutBrut = champTexte(formData, "statut");
  if (!chequeId || !statutBrut || !(statutBrut in StatutCheque)) {
    return;
  }
  const statut = statutBrut as StatutCheque;

  const cible = await prisma.cheque.findUnique({
    where: { id: chequeId },
    include: { paiement: { include: { echeance: true } } },
  });
  if (!cible) return;

  await prisma.cheque.update({
    where: { id: chequeId },
    data: {
      statut,
      motifRejet: statut === "REJETE" ? champTexte(formData, "motifRejet") : null,
      dateDepot: statut === "DEPOSE" || statut === "ENCAISSE" ? new Date() : undefined,
      dateEncaissement: statut === "ENCAISSE" ? new Date() : undefined,
    },
  });

  revalidatePath(`/paiements/${cible.paiement.echeance.dossierAnnuelId}`);
}
