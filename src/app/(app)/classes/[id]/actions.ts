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

function retour(classeId: string, erreur?: string): never {
  redirect(
    erreur ? `/classes/${classeId}?error=${erreur}` : `/classes/${classeId}?ok=1`,
  );
}

export async function modifierClasseAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.CLASSES, "ECRITURE");

  const classeId = champTexte(formData, "classeId");
  const cohorteId = champTexte(formData, "cohorteId");
  const coursId = champTexte(formData, "coursId");
  const heureDebut = champTexte(formData, "heureDebut");
  const heureFin = champTexte(formData, "heureFin");
  if (!classeId) redirect("/classes");
  if (!cohorteId || !coursId || !heureDebut || !heureFin) {
    retour(classeId, "CHAMPS_MANQUANTS");
  }

  const semestre = champTexte(formData, "semestre");

  const classeActuelle = await prisma.classe.findUnique({ where: { id: classeId } });
  if (!classeActuelle) redirect("/classes");

  // Le Cours choisi doit effectivement appartenir au bloc de la Cohorte
  // choisie (voir Cohorte/CohorteCours, plusieurs Cours possibles par
  // Cohorte) — sinon la Classe instancierait une matière hors du bloc.
  const coursDansCohorte = await prisma.cohorteCours.findUnique({
    where: { cohorteId_coursId: { cohorteId, coursId } },
  });
  if (!coursDansCohorte) retour(classeId, "COURS_HORS_COHORTE");

  // Même garde-fou qu'à la création (voir classes/nouveau/actions.ts) :
  // modifier la cohorte/le cours/la session d'une classe ne doit pas non
  // plus aboutir à deux classes strictement identiques sur la même période
  // (une Cohorte peut désormais porter plusieurs Cours, donc plusieurs
  // Classes légitimes sur le même cohorteId+anneeScolaireId+semestre — la
  // clé de doublon inclut donc coursId).
  const doublon = await prisma.classe.findFirst({
    where: {
      id: { not: classeId },
      cohorteId,
      coursId,
      anneeScolaireId: classeActuelle.anneeScolaireId,
      semestre,
    },
  });
  if (doublon) retour(classeId, "CLASSE_DEJA_EXISTANTE");

  const enseignantIds = formData.getAll("enseignants").filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  await prisma.$transaction([
    prisma.classe.update({
      where: { id: classeId },
      data: {
        cohorteId,
        coursId,
        heureDebut,
        heureFin,
        semestre,
        salleId: champTexte(formData, "salleId"),
      },
    }),
    prisma.classeEnseignant.deleteMany({ where: { classeId } }),
    ...(enseignantIds.length > 0
      ? [
          prisma.classeEnseignant.createMany({
            data: enseignantIds.map((utilisateurId) => ({ classeId, utilisateurId })),
          }),
        ]
      : []),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_classe",
        entite: "Classe",
        entiteId: classeId,
      },
    }),
  ]);

  revalidatePath(`/classes/${classeId}`);
  revalidatePath("/classes");
  retour(classeId);
}

export async function supprimerClasseAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.CLASSES, "ECRITURE");

  const classeId = champTexte(formData, "classeId");
  if (!classeId) redirect("/classes");

  const cible = await prisma.classe.findUnique({
    where: { id: classeId },
    include: { _count: { select: { seances: true, inscriptions: true } } },
  });
  if (!cible) redirect("/classes");

  // Supprimer une classe avec des séances ou des inscriptions effacerait
  // silencieusement des présences/inscriptions déjà constituées (cascade
  // en base). On ne l'autorise que pour une classe encore vide.
  if (cible._count.seances > 0 || cible._count.inscriptions > 0) {
    retour(classeId, "CLASSE_UTILISEE");
  }

  await prisma.$transaction([
    prisma.classe.delete({ where: { id: classeId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_classe",
        entite: "Classe",
        entiteId: classeId,
      },
    }),
  ]);

  revalidatePath("/classes");
  redirect("/classes?ok=1");
}
