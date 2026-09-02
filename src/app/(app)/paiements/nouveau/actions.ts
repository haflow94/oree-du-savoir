"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";
import { affecterEtudiantACohorte } from "@/lib/cohortes";

export async function creerDossierAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.PAIEMENTS, "ECRITURE");

  const etudiantId = String(formData.get("etudiantId") ?? "").trim();
  const anneeScolaireId = String(formData.get("anneeScolaireId") ?? "").trim();
  const montantDu = String(formData.get("montantDu") ?? "").trim();
  // Optionnel : affectation immédiate à une Cohorte (voir
  // prisma/schema.prisma#AffectationCohorte). Le staff choisit la Cohorte à
  // la main — le "créneau souhaité" de préinscription (Section +
  // CreneauSection, catalogue générique) ne pointe vers aucune Cohorte
  // précise, impossible à déduire automatiquement.
  const cohorteId = String(formData.get("cohorteId") ?? "").trim() || null;

  if (!etudiantId || !anneeScolaireId || !montantDu) {
    redirect("/paiements/nouveau?error=CHAMPS_MANQUANTS");
  }

  const existant = await prisma.dossierAnnuel.findUnique({
    where: { etudiantId_anneeScolaireId: { etudiantId, anneeScolaireId } },
  });
  if (existant) {
    redirect(`/paiements/${existant.id}?error=DOSSIER_EXISTANT`);
  }

  // Le dossier reste la source de vérité comptable, créé seul (déjà
  // atomique) : un dossier sans affectation Cohorte est un état valide,
  // l'affectation ci-dessous est explicitement optionnelle et ne doit jamais
  // faire échouer la création du dossier. Journalisé (montantDu saisi) pour
  // pouvoir retrouver qui a validé quel montant en cas d'écart constaté plus
  // tard avec le tarif de section (voir modifierMontantDuAction, déjà
  // journalisée, pour les corrections ultérieures).
  const dossier = await prisma.$transaction(async (tx) => {
    const cree = await tx.dossierAnnuel.create({
      data: { etudiantId, anneeScolaireId, montantDu },
    });
    await tx.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "creation_dossier_annuel",
        entite: "DossierAnnuel",
        entiteId: cree.id,
        details: { etudiantId, anneeScolaireId, montantDu },
      },
    });
    return cree;
  });

  if (cohorteId) {
    const resultat = await affecterEtudiantACohorte({
      etudiantId,
      cohorteId,
      anneeScolaireId,
      utilisateurId: session.id,
    });
    if (resultat.statut === "COHORTE_INTROUVABLE") {
      redirect(`/paiements/${dossier.id}?error=COHORTE_INTROUVABLE`);
    }
  }

  redirect(`/paiements/${dossier.id}`);
}
