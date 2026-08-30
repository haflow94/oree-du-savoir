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
      select: { cohorteId: true, semestre: true },
    }),
  ]);

  const dejaPresente = (c: (typeof classesSource)[number]) =>
    classesActives.some((e) => e.cohorteId === c.cohorteId && e.semestre === c.semestre);
  const aCreer = classesSource.filter((c) => !dejaPresente(c));

  await prisma.$transaction([
    ...aCreer.map((c) =>
      prisma.classe.create({
        data: {
          cohorteId: c.cohorteId,
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
    include: { _count: { select: { cohortes: true } } },
  });
  if (!cible) retour("INTROUVABLE");

  // Une cohorte pointe vers son cours (onDelete: Restrict) : la suppression
  // échouerait de toute façon, mais on donne un message clair plutôt que
  // de laisser remonter l'erreur de contrainte SQL.
  if (cible._count.cohortes > 0) retour("COURS_UTILISE");

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

// CRUD du catalogue amont Cohorte (Cours + Niveau + Jour), créé une fois et
// réutilisé chaque année scolaire pour instancier une ou plusieurs Classe —
// calqué sur creerCoursAction/modifierCoursAction/supprimerCoursAction
// ci-dessus.
export async function creerCohorteAction(formData: FormData): Promise<void> {
  await requireModule(Module.CLASSES, "ECRITURE");
  const coursId = String(formData.get("coursId") ?? "").trim();
  const jour = String(formData.get("jour") ?? "").trim();
  const niveau = String(formData.get("niveau") ?? "").trim() || null;
  if (!coursId || !estJourValide(jour)) retour("COHORTE_CHAMPS_MANQUANTS");

  const doublon = await prisma.cohorte.findFirst({ where: { coursId, jour, niveau } });
  if (doublon) retour("COHORTE_DEJA_EXISTANTE");

  await prisma.cohorte.create({ data: { coursId, jour, niveau } });
  revalidatePath("/classes");
  revalidatePath("/classes/nouveau");
  retour();
}

export async function modifierCohorteAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.CLASSES, "ECRITURE");
  const cohorteId = String(formData.get("cohorteId") ?? "").trim();
  const coursId = String(formData.get("coursId") ?? "").trim();
  const jour = String(formData.get("jour") ?? "").trim();
  const niveau = String(formData.get("niveau") ?? "").trim() || null;
  if (!cohorteId || !coursId || !estJourValide(jour)) retour("COHORTE_CHAMPS_MANQUANTS");

  const cible = await prisma.cohorte.findUnique({ where: { id: cohorteId } });
  if (!cible) retour("COHORTE_INTROUVABLE");

  const doublon = await prisma.cohorte.findFirst({ where: { coursId, jour, niveau } });
  if (doublon && doublon.id !== cohorteId) retour("COHORTE_DEJA_EXISTANTE");

  await prisma.$transaction([
    prisma.cohorte.update({ where: { id: cohorteId }, data: { coursId, jour, niveau } }),
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
    include: { _count: { select: { classes: true } } },
  });
  if (!cible) retour("COHORTE_INTROUVABLE");

  // Une classe pointe vers sa cohorte (onDelete: Restrict) : la suppression
  // échouerait de toute façon, mais on donne un message clair plutôt que
  // de laisser remonter l'erreur de contrainte SQL.
  if (cible._count.classes > 0) retour("COHORTE_UTILISEE");

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
