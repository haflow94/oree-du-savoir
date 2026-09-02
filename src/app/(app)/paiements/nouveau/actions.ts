"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";

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
    const cohorte = await prisma.cohorte.findUnique({ where: { id: cohorteId } });
    if (!cohorte) {
      redirect(`/paiements/${dossier.id}?error=COHORTE_INTROUVABLE`);
    }

    const dejaAffecte = await prisma.affectationCohorte.findUnique({
      where: { etudiantId_cohorteId_anneeScolaireId: { etudiantId, cohorteId, anneeScolaireId } },
    });

    if (!dejaAffecte) {
      const [classesDuBloc, compteAffectes, compteEnAttente] = await Promise.all([
        prisma.classe.findMany({ where: { cohorteId, anneeScolaireId }, select: { id: true } }),
        prisma.affectationCohorte.count({
          where: { cohorteId, anneeScolaireId, statut: "AFFECTE" },
        }),
        prisma.affectationCohorte.count({
          where: { cohorteId, anneeScolaireId, statut: "EN_ATTENTE" },
        }),
      ]);
      const placeDisponible = cohorte.capaciteMax === null || compteAffectes < cohorte.capaciteMax;

      await prisma.$transaction([
        prisma.affectationCohorte.create({
          data: {
            etudiantId,
            cohorteId,
            anneeScolaireId,
            statut: placeDisponible ? "AFFECTE" : "EN_ATTENTE",
            // Rang FIFO au sein de la liste d'attente de cette Cohorte+année
            // (voir AffectationCohorte.rangListeAttente) — sans effet si
            // placeDisponible (reste null).
            rangListeAttente: placeDisponible ? null : compteEnAttente + 1,
          },
        }),
        // Fan-out : une InscriptionClasse par Classe du bloc pour cette
        // année (tout ou rien sur les Cours de la Cohorte, voir décision
        // associée). skipDuplicates couvre le cas d'un étudiant déjà inscrit
        // manuellement à l'une des Classes du bloc. No-op si aucune Classe
        // n'existe encore pour ce bloc sur cette année (affectation
        // administrative en attendant que le staff crée les Classes).
        ...(placeDisponible && classesDuBloc.length > 0
          ? [
              prisma.inscriptionClasse.createMany({
                data: classesDuBloc.map((c) => ({ etudiantId, classeId: c.id })),
                skipDuplicates: true,
              }),
            ]
          : []),
        prisma.journalAudit.create({
          data: {
            utilisateurId: session.id,
            action: placeDisponible ? "affectation_cohorte" : "mise_en_attente_cohorte",
            entite: "AffectationCohorte",
            details: { cohorteId, etudiantId, anneeScolaireId },
          },
        }),
      ]);
    }
  }

  redirect(`/paiements/${dossier.id}`);
}
