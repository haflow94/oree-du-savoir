"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";
import { JourSemaine } from "@/generated/prisma/enums";

function retour(erreur?: string): never {
  redirect(erreur ? `/classes?error=${erreur}` : "/classes?ok=1");
}

function estJourValide(valeur: string): valeur is JourSemaine {
  return valeur in JourSemaine;
}

export async function creerCoursAction(formData: FormData): Promise<void> {
  await requireModule(Module.CLASSES, "ECRITURE");
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
  const session = await requireModule(Module.CLASSES, "ECRITURE");
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
// active (cohorte, créneau, salle, enseignants) : évite de tout resaisir à la
// main à chaque rentrée pour des matières qui reviennent à l'identique.
// Idempotent par (cohorte, semestre) : ne duplique jamais une classe déjà
// présente sur l'année active.
export async function dupliquerClassesAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.CLASSES, "ECRITURE");
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
      select: { cohorteId: true, coursId: true, semestre: true },
    }),
  ]);

  const dejaPresente = (c: (typeof classesSource)[number]) =>
    classesActives.some(
      (e) => e.cohorteId === c.cohorteId && e.coursId === c.coursId && e.semestre === c.semestre,
    );
  const aCreer = classesSource.filter((c) => !dejaPresente(c));

  await prisma.$transaction([
    ...aCreer.map((c) =>
      prisma.classe.create({
        data: {
          cohorteId: c.cohorteId,
          coursId: c.coursId,
          anneeScolaireId: anneeActive.id,
          semestre: c.semestre,
          heureDebut: c.heureDebut,
          heureFin: c.heureFin,
          salleId: c.salleId,
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
  const session = await requireModule(Module.CLASSES, "ECRITURE");
  const coursId = String(formData.get("coursId") ?? "").trim();
  if (!coursId) retour("CHAMPS_INVALIDES");

  const cible = await prisma.cours.findUnique({
    where: { id: coursId },
    include: { _count: { select: { cohortesLiees: true, classes: true } } },
  });
  if (!cible) retour("INTROUVABLE");

  // Une CohorteCours ou une Classe pointe vers ce cours (onDelete: Restrict)
  // : la suppression échouerait de toute façon, mais on donne un message
  // clair plutôt que de laisser remonter l'erreur de contrainte SQL.
  if (cible._count.cohortesLiees > 0 || cible._count.classes > 0) retour("COURS_UTILISE");

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

// CRUD du catalogue amont Cohorte (Section + Niveau + Jour), créé une fois
// et réutilisé chaque année scolaire — les Cours lui sont affectés ensuite,
// jamais l'inverse (voir prisma/schema.prisma#Cohorte). Calqué sur
// creerCoursAction/modifierCoursAction/supprimerCoursAction ci-dessus.
export async function creerCohorteAction(formData: FormData): Promise<void> {
  await requireModule(Module.CLASSES, "ECRITURE");
  const sectionId = String(formData.get("sectionId") ?? "").trim();
  // Les cours affectés sont optionnels dès la création : une Cohorte existe
  // par elle-même (Section+niveau+jour), les cours peuvent être affectés
  // plus tard depuis l'édition de la même Cohorte.
  const coursIds = formData
    .getAll("coursIds")
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const jour = String(formData.get("jour") ?? "").trim();
  const niveau = String(formData.get("niveau") ?? "").trim() || null;
  const capaciteMaxBrut = String(formData.get("capaciteMax") ?? "").trim();
  const capaciteMax = capaciteMaxBrut ? Number(capaciteMaxBrut) : null;
  if (!sectionId || !estJourValide(jour)) retour("COHORTE_CHAMPS_MANQUANTS");
  if (capaciteMax !== null && (!Number.isInteger(capaciteMax) || capaciteMax < 1)) {
    retour("COHORTE_CAPACITE_INVALIDE");
  }

  if (coursIds.length > 0) {
    const coursValides = await prisma.cours.count({ where: { id: { in: coursIds }, sectionId } });
    if (coursValides !== coursIds.length) retour("COURS_HORS_SECTION");
  }

  // findFirst plutôt que findUnique sur la clé composée : le champ niveau
  // est nullable, or Prisma exige des valeurs non-nulles pour interroger une
  // contrainte @@unique composée par ce biais (limitation connue).
  const doublon = await prisma.cohorte.findFirst({
    where: { sectionId, niveau, jour },
  });
  if (doublon) retour("COHORTE_DEJA_EXISTANTE");

  await prisma.cohorte.create({
    data: {
      sectionId,
      jour,
      niveau,
      capaciteMax,
      coursLies: { create: coursIds.map((coursId, ordre) => ({ coursId, ordre })) },
    },
  });
  revalidatePath("/classes");
  revalidatePath("/classes/nouveau");
  retour();
}

export async function modifierCohorteAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.CLASSES, "ECRITURE");
  const cohorteId = String(formData.get("cohorteId") ?? "").trim();
  const sectionId = String(formData.get("sectionId") ?? "").trim();
  const coursIds = formData
    .getAll("coursIds")
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const jour = String(formData.get("jour") ?? "").trim();
  const niveau = String(formData.get("niveau") ?? "").trim() || null;
  const capaciteMaxBrut = String(formData.get("capaciteMax") ?? "").trim();
  const capaciteMax = capaciteMaxBrut ? Number(capaciteMaxBrut) : null;
  if (!cohorteId || !sectionId || !estJourValide(jour)) {
    retour("COHORTE_CHAMPS_MANQUANTS");
  }
  if (capaciteMax !== null && (!Number.isInteger(capaciteMax) || capaciteMax < 1)) {
    retour("COHORTE_CAPACITE_INVALIDE");
  }

  const cible = await prisma.cohorte.findUnique({
    where: { id: cohorteId },
    include: { classes: { select: { coursId: true } }, coursLies: { select: { coursId: true } } },
  });
  if (!cible) retour("COHORTE_INTROUVABLE");

  // Changer la Section d'une Cohorte qui a déjà des cours affectés casserait
  // la cohérence (un cours n'appartient qu'à une section) : bloqué. Une
  // Cohorte encore vide peut changer de section librement.
  if (sectionId !== cible.sectionId && cible.coursLies.length > 0) {
    retour("COHORTE_SECTION_VERROUILLEE");
  }

  if (coursIds.length > 0) {
    const coursValides = await prisma.cours.count({ where: { id: { in: coursIds }, sectionId } });
    if (coursValides !== coursIds.length) retour("COURS_HORS_SECTION");
  }

  // Un Cours retiré de la Cohorte mais encore instancié par une Classe
  // existante de cette Cohorte laisserait une Classe incohérente : bloqué,
  // plutôt qu'une incohérence silencieuse entre Classe.coursId et
  // CohorteCours.
  const coursEncoreUtilises = cible.classes
    .map((c) => c.coursId)
    .filter((id) => !coursIds.includes(id));
  if (coursEncoreUtilises.length > 0) retour("COHORTE_COURS_UTILISE");

  // findFirst plutôt que findUnique sur la clé composée : le champ niveau
  // est nullable, or Prisma exige des valeurs non-nulles pour interroger une
  // contrainte @@unique composée par ce biais (limitation connue).
  const doublon = await prisma.cohorte.findFirst({
    where: { sectionId, niveau, jour },
  });
  if (doublon && doublon.id !== cohorteId) retour("COHORTE_DEJA_EXISTANTE");

  await prisma.$transaction([
    prisma.cohorteCours.deleteMany({ where: { cohorteId } }),
    prisma.cohorteCours.createMany({
      data: coursIds.map((coursId, ordre) => ({ cohorteId, coursId, ordre })),
    }),
    prisma.cohorte.update({ where: { id: cohorteId }, data: { sectionId, jour, niveau, capaciteMax } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_cohorte",
        entite: "Cohorte",
        entiteId: cohorteId,
      },
    }),
  ]);

  revalidatePath("/classes");
  retour();
}

export async function supprimerCohorteAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.CLASSES, "ECRITURE");
  const cohorteId = String(formData.get("cohorteId") ?? "").trim();
  if (!cohorteId) retour("COHORTE_CHAMPS_MANQUANTS");

  const cible = await prisma.cohorte.findUnique({
    where: { id: cohorteId },
    include: { _count: { select: { classes: true, affectations: true } } },
  });
  if (!cible) retour("COHORTE_INTROUVABLE");

  // Une classe pointe vers sa cohorte (onDelete: Restrict) : la suppression
  // échouerait de toute façon, mais on donne un message clair plutôt que
  // de laisser remonter l'erreur de contrainte SQL. Une affectation en cours
  // (voir AffectationCohorte) bloque aussi la suppression : supprimer la
  // cohorte perdrait la trace de qui y est affecté/en attente.
  if (cible._count.classes > 0 || cible._count.affectations > 0) retour("COHORTE_UTILISEE");

  await prisma.$transaction([
    prisma.cohorte.delete({ where: { id: cohorteId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_cohorte",
        entite: "Cohorte",
        entiteId: cohorteId,
      },
    }),
  ]);

  revalidatePath("/classes");
  retour();
}
