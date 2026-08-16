"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MoyenPaiement, StatutCheque } from "@/generated/prisma/enums";

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

export async function ajouterEcheanceAction(formData: FormData): Promise<void> {
  await requireSession();

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
  const session = await requireSession();

  const echeanceId = champTexte(formData, "echeanceId");
  const dossierAnnuelId = champTexte(formData, "dossierAnnuelId");
  const montant = champTexte(formData, "montant");
  const moyenBrut = champTexte(formData, "moyen");
  if (!echeanceId || !dossierAnnuelId || !montant || !moyenBrut || !(moyenBrut in MoyenPaiement)) {
    return;
  }
  const moyen = moyenBrut as MoyenPaiement;

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

  revalidatePath(`/paiements/${dossierAnnuelId}`);
  revalidatePath("/paiements");
}

export async function mettreAJourChequeAction(formData: FormData): Promise<void> {
  await requireSession();

  const chequeId = champTexte(formData, "chequeId");
  const dossierAnnuelId = champTexte(formData, "dossierAnnuelId");
  const statutBrut = champTexte(formData, "statut");
  if (!chequeId || !dossierAnnuelId || !statutBrut || !(statutBrut in StatutCheque)) {
    return;
  }
  const statut = statutBrut as StatutCheque;

  await prisma.cheque.update({
    where: { id: chequeId },
    data: {
      statut,
      motifRejet: statut === "REJETE" ? champTexte(formData, "motifRejet") : null,
      dateDepot: statut === "DEPOSE" || statut === "ENCAISSE" ? new Date() : undefined,
      dateEncaissement: statut === "ENCAISSE" ? new Date() : undefined,
    },
  });

  revalidatePath(`/paiements/${dossierAnnuelId}`);
}
