"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

/** Entier positif (>= 1) : ni 0 ni négatif, une relance/un délai nul n'a pas de sens. */
function champEntierPositif(formData: FormData, nom: string): number | null {
  const valeur = champTexte(formData, nom);
  if (!valeur) return null;
  const n = Number.parseInt(valeur, 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function retour(erreur?: string): never {
  redirect(erreur ? `/administration/relances?error=${erreur}` : "/administration/relances?ok=1");
}

// Réglage du flux n8n de relance paiement/pièce d'identité (voir modèle
// ParametresRelance) : une seule ligne, créée par le seed — cette action ne
// fait qu'éditer le nombre max de relances et le délai en jours.
export async function modifierParametresRelanceAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const parametresId = champTexte(formData, "parametresId");
  const nombreMaxRelances = champEntierPositif(formData, "nombreMaxRelances");
  const delaiJours = champEntierPositif(formData, "delaiJours");
  if (!parametresId || !nombreMaxRelances || !delaiJours) retour("CHAMPS_INVALIDES");

  const cible = await prisma.parametresRelance.findUnique({ where: { id: parametresId } });
  if (!cible) retour("INTROUVABLE");

  await prisma.$transaction([
    prisma.parametresRelance.update({
      where: { id: parametresId },
      data: { nombreMaxRelances, delaiJours },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_parametres_relance",
        entite: "ParametresRelance",
        entiteId: parametresId,
        details: { nombreMaxRelances, delaiJours },
      },
    }),
  ]);

  revalidatePath("/administration/relances");
  retour();
}

// Réglage d'un flux distinct (alerte interne Bureau, voir
// Cheque.nombreAlertesEnvoyees) : même mécanique que ci-dessus mais des
// champs séparés, volontairement pas couplés à la relance famille — ce
// n'est pas la même règle métier (voir schema.prisma).
export async function modifierParametresAlerteChequeAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const parametresId = champTexte(formData, "parametresId");
  const nombreMaxAlertesCheque = champEntierPositif(formData, "nombreMaxAlertesCheque");
  const delaiJoursCheque = champEntierPositif(formData, "delaiJoursCheque");
  if (!parametresId || !nombreMaxAlertesCheque || !delaiJoursCheque) retour("CHAMPS_INVALIDES");

  const cible = await prisma.parametresRelance.findUnique({ where: { id: parametresId } });
  if (!cible) retour("INTROUVABLE");

  await prisma.$transaction([
    prisma.parametresRelance.update({
      where: { id: parametresId },
      data: { nombreMaxAlertesCheque, delaiJoursCheque },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_parametres_alerte_cheque",
        entite: "ParametresRelance",
        entiteId: parametresId,
        details: { nombreMaxAlertesCheque, delaiJoursCheque },
      },
    }),
  ]);

  revalidatePath("/administration/relances");
  retour();
}

// Réglage d'un 3e flux, sans rapport avec les deux précédents (rapport
// effectifs + trésorerie au Bureau, voir dureeIntensiveRapportSemaines dans
// schema.prisma) : nombre de semaines après le 1er septembre pendant
// lesquelles la cadence reste hebdomadaire avant de repasser mensuelle.
export async function modifierDureeIntensiveRapportAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const parametresId = champTexte(formData, "parametresId");
  const dureeIntensiveRapportSemaines = champEntierPositif(formData, "dureeIntensiveRapportSemaines");
  if (!parametresId || !dureeIntensiveRapportSemaines) retour("CHAMPS_INVALIDES");

  const cible = await prisma.parametresRelance.findUnique({ where: { id: parametresId } });
  if (!cible) retour("INTROUVABLE");

  await prisma.$transaction([
    prisma.parametresRelance.update({
      where: { id: parametresId },
      data: { dureeIntensiveRapportSemaines },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_duree_intensive_rapport",
        entite: "ParametresRelance",
        entiteId: parametresId,
        details: { dureeIntensiveRapportSemaines },
      },
    }),
  ]);

  revalidatePath("/administration/relances");
  retour();
}
