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

// anneeScolaireId préservé dans la redirection pour rester sur l'année
// consultée (sinon le sélecteur d'année de la page retombe silencieusement
// sur l'année active par défaut après une action, en décalage avec la
// sélection affichée côté client).
function retour(cohorteId: string, anneeScolaireId?: string, erreur?: string): never {
  const suffixe = anneeScolaireId ? `&anneeScolaireId=${anneeScolaireId}` : "";
  redirect(
    erreur
      ? `/classes/cohortes/${cohorteId}?error=${erreur}${suffixe}`
      : `/classes/cohortes/${cohorteId}?ok=1${suffixe}`,
  );
}

// Promotion depuis la liste d'attente d'une Cohorte : toujours un geste
// manuel du staff (jamais déclenché automatiquement, même quand une place se
// libère — voir AffectationCohorte dans prisma/schema.prisma). Module
// ETUDIANTS : même rattachement que inscrireEtudiantAction
// (presences/actions.ts), acte de gestion du dossier de l'étudiant plutôt
// que de la Classe elle-même.
export async function promouvoirAffectationCohorteAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const affectationId = champTexte(formData, "affectationId");
  const cohorteId = champTexte(formData, "cohorteId");
  const anneeScolaireIdFormulaire = champTexte(formData, "anneeScolaireId") ?? undefined;
  if (!cohorteId) redirect("/classes");
  if (!affectationId) retour(cohorteId, anneeScolaireIdFormulaire, "AFFECTATION_INTROUVABLE");

  const affectation = await prisma.affectationCohorte.findUnique({
    where: { id: affectationId },
    include: { cohorte: true },
  });
  if (!affectation || affectation.cohorteId !== cohorteId) {
    retour(cohorteId, anneeScolaireIdFormulaire, "AFFECTATION_INTROUVABLE");
  }
  if (affectation.statut !== "EN_ATTENTE") retour(cohorteId, affectation.anneeScolaireId, "DEJA_AFFECTE");

  const [classesDuBloc, compteActuel] = await Promise.all([
    prisma.classe.findMany({
      where: { cohorteId, anneeScolaireId: affectation.anneeScolaireId },
      select: { id: true },
    }),
    prisma.affectationCohorte.count({
      where: { cohorteId, anneeScolaireId: affectation.anneeScolaireId, statut: "AFFECTE" },
    }),
  ]);
  // Race condition possible entre deux membres du staff qui promeuvent en
  // même temps : re-vérifié ici plutôt que de faire confiance à l'affichage
  // déjà chargé côté client.
  if (affectation.cohorte.capaciteMax !== null && compteActuel >= affectation.cohorte.capaciteMax) {
    retour(cohorteId, affectation.anneeScolaireId, "COHORTE_COMPLETE");
  }

  await prisma.$transaction([
    prisma.affectationCohorte.update({
      where: { id: affectationId },
      data: { statut: "AFFECTE", rangListeAttente: null },
    }),
    ...(classesDuBloc.length > 0
      ? [
          prisma.inscriptionClasse.createMany({
            data: classesDuBloc.map((c) => ({ etudiantId: affectation.etudiantId, classeId: c.id })),
            skipDuplicates: true,
          }),
        ]
      : []),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "promotion_liste_attente_cohorte",
        entite: "AffectationCohorte",
        entiteId: affectationId,
      },
    }),
  ]);

  revalidatePath(`/classes/cohortes/${cohorteId}`);
  retour(cohorteId, affectation.anneeScolaireId);
}

// Retire un étudiant affecté (ou en attente) de la Cohorte : supprime les
// InscriptionClasse du bloc + l'AffectationCohorte. La place laissée
// vacante n'est jamais reprise automatiquement par le suivant de la liste
// d'attente (voir promouvoirAffectationCohorteAction ci-dessus) — le staff
// garde la main.
export async function retirerAffectationCohorteAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const affectationId = champTexte(formData, "affectationId");
  const cohorteId = champTexte(formData, "cohorteId");
  const anneeScolaireIdFormulaire = champTexte(formData, "anneeScolaireId") ?? undefined;
  if (!cohorteId) redirect("/classes");
  if (!affectationId) retour(cohorteId, anneeScolaireIdFormulaire, "AFFECTATION_INTROUVABLE");

  const affectation = await prisma.affectationCohorte.findUnique({ where: { id: affectationId } });
  if (!affectation || affectation.cohorteId !== cohorteId) {
    retour(cohorteId, anneeScolaireIdFormulaire, "AFFECTATION_INTROUVABLE");
  }

  await prisma.$transaction([
    prisma.inscriptionClasse.deleteMany({
      where: {
        etudiantId: affectation.etudiantId,
        classe: { cohorteId, anneeScolaireId: affectation.anneeScolaireId },
      },
    }),
    prisma.affectationCohorte.delete({ where: { id: affectationId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "retrait_affectation_cohorte",
        entite: "AffectationCohorte",
        entiteId: affectationId,
        details: { etudiantId: affectation.etudiantId, anneeScolaireId: affectation.anneeScolaireId },
      },
    }),
  ]);

  revalidatePath(`/classes/cohortes/${cohorteId}`);
  retour(cohorteId, affectation.anneeScolaireId);
}
