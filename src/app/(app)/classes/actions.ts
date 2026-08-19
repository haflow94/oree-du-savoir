"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";

const PEUT_GERER = [Role.ADMINISTRATION, Role.BUREAU];

function retour(erreur?: string): never {
  redirect(erreur ? `/classes?error=${erreur}` : "/classes?ok=1");
}

export async function creerCoursAction(formData: FormData): Promise<void> {
  await requireRole(PEUT_GERER);
  const nom = String(formData.get("nom") ?? "").trim();
  const sectionId = String(formData.get("sectionId") ?? "").trim();
  if (!nom || !sectionId) retour("CHAMPS_INVALIDES");

  const existant = await prisma.cours.findUnique({ where: { nom } });
  if (existant) retour("NOM_DEJA_UTILISE");

  await prisma.cours.create({ data: { nom, sectionId } });
  revalidatePath("/classes");
  revalidatePath("/classes/nouveau");
  retour();
}

export async function modifierCoursAction(formData: FormData): Promise<void> {
  const session = await requireRole(PEUT_GERER);
  const coursId = String(formData.get("coursId") ?? "").trim();
  const nom = String(formData.get("nom") ?? "").trim();
  const sectionId = String(formData.get("sectionId") ?? "").trim();
  if (!coursId || !nom || !sectionId) retour("CHAMPS_INVALIDES");

  const cible = await prisma.cours.findUnique({ where: { id: coursId } });
  if (!cible) retour("INTROUVABLE");

  const homonyme = await prisma.cours.findUnique({ where: { nom } });
  if (homonyme && homonyme.id !== coursId) retour("NOM_DEJA_UTILISE");

  await prisma.$transaction([
    prisma.cours.update({ where: { id: coursId }, data: { nom, sectionId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_cours",
        entite: "Cours",
        entiteId: coursId,
        details: { avant: cible.nom, apres: nom },
      },
    }),
  ]);

  revalidatePath("/classes");
  retour();
}

// Copie en une fois toutes les classes d'une année source vers l'année
// active (cours, niveau, créneau, salle, capacité, enseignants) : évite de
// tout resaisir à la main à chaque rentrée pour des matières qui reviennent
// à l'identique. Idempotent par (cours, niveau, jour, heure de début) : ne
// duplique jamais une classe déjà présente sur l'année active.
export async function dupliquerClassesAction(formData: FormData): Promise<void> {
  const session = await requireRole(PEUT_GERER);
  const anneeSourceId = String(formData.get("anneeSourceId") ?? "").trim();
  if (!anneeSourceId) retour("ANNEE_SOURCE_MANQUANTE");

  const anneeActive = await prisma.anneeScolaire.findFirst({ where: { active: true } });
  if (!anneeActive) retour("AUCUNE_ANNEE_ACTIVE");
  if (anneeActive.id === anneeSourceId) retour("MEME_ANNEE");

  const [classesSource, classesActives] = await Promise.all([
    prisma.classe.findMany({
      where: { anneeScolaireId: anneeSourceId },
      include: { enseignants: true },
    }),
    prisma.classe.findMany({
      where: { anneeScolaireId: anneeActive.id },
      select: { coursId: true, niveau: true, jour: true, heureDebut: true },
    }),
  ]);

  const dejaPresente = (c: (typeof classesSource)[number]) =>
    classesActives.some(
      (e) =>
        e.coursId === c.coursId &&
        e.niveau === c.niveau &&
        e.jour === c.jour &&
        e.heureDebut === c.heureDebut,
    );
  const aCreer = classesSource.filter((c) => !dejaPresente(c));

  await prisma.$transaction([
    ...aCreer.map((c) =>
      prisma.classe.create({
        data: {
          coursId: c.coursId,
          anneeScolaireId: anneeActive.id,
          niveau: c.niveau,
          semestre: c.semestre,
          jour: c.jour,
          heureDebut: c.heureDebut,
          heureFin: c.heureFin,
          salle: c.salle,
          capacite: c.capacite,
          enseignants: {
            create: c.enseignants.map((e) => ({ utilisateurId: e.utilisateurId })),
          },
        },
      }),
    ),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "duplication_classes",
        entite: "AnneeScolaire",
        entiteId: anneeActive.id,
        details: { depuisAnneeId: anneeSourceId, nombreCreees: aCreer.length },
      },
    }),
  ]);

  revalidatePath("/classes");
  retour();
}

export async function supprimerCoursAction(formData: FormData): Promise<void> {
  const session = await requireRole(PEUT_GERER);
  const coursId = String(formData.get("coursId") ?? "").trim();
  if (!coursId) retour("CHAMPS_INVALIDES");

  const cible = await prisma.cours.findUnique({
    where: { id: coursId },
    include: { _count: { select: { classes: true } } },
  });
  if (!cible) retour("INTROUVABLE");

  // Une classe pointe vers son cours (onDelete: Restrict) : la suppression
  // échouerait de toute façon, mais on donne un message clair plutôt que
  // de laisser remonter l'erreur de contrainte SQL.
  if (cible._count.classes > 0) retour("COURS_UTILISE");

  await prisma.$transaction([
    prisma.cours.delete({ where: { id: coursId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_cours",
        entite: "Cours",
        entiteId: coursId,
        details: { nom: cible.nom },
      },
    }),
  ]);

  revalidatePath("/classes");
  retour();
}
