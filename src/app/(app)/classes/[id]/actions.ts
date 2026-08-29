"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { JourSemaine } from "@/generated/prisma/enums";
import { requireModule, Module } from "@/lib/permissions";

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

function estJourValide(valeur: string | null): valeur is JourSemaine {
  return !!valeur && valeur in JourSemaine;
}

function retour(classeId: string, erreur?: string): never {
  redirect(
    erreur ? `/classes/${classeId}?error=${erreur}` : `/classes/${classeId}?ok=1`,
  );
}

export async function modifierClasseAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.CLASSES, "ECRITURE");

  const classeId = champTexte(formData, "classeId");
  const jour = champTexte(formData, "jour");
  const heureDebut = champTexte(formData, "heureDebut");
  const heureFin = champTexte(formData, "heureFin");
  if (!classeId) redirect("/classes");
  if (!estJourValide(jour) || !heureDebut || !heureFin) {
    retour(classeId, "CHAMPS_MANQUANTS");
  }

  const niveau = champTexte(formData, "niveau");
  const semestre = champTexte(formData, "semestre");

  const classeActuelle = await prisma.classe.findUnique({ where: { id: classeId } });
  if (!classeActuelle) redirect("/classes");

  // Même garde-fou qu'à la création (voir classes/nouveau/actions.ts) :
  // modifier le niveau/la session d'une classe ne doit pas non plus aboutir
  // à deux classes strictement identiques sur la même période.
  const doublon = await prisma.classe.findFirst({
    where: {
      id: { not: classeId },
      coursId: classeActuelle.coursId,
      anneeScolaireId: classeActuelle.anneeScolaireId,
      niveau,
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
        jour,
        heureDebut,
        heureFin,
        niveau,
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

// Les actions de cohorte sont rattachées au module Étudiants (comme
// inscrireEtudiantAction/retirerEtudiantAction dans presences/actions.ts) :
// une cohorte n'est qu'un raccourci de sélection pour affecter des étudiants
// à une classe, pas un attribut de la classe elle-même.
export async function creerCohorteAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const classeId = champTexte(formData, "classeId");
  const nom = champTexte(formData, "nom");
  if (!classeId) redirect("/classes");
  if (!nom) retour(classeId, "COHORTE_NOM_MANQUANT");

  const doublon = await prisma.cohorte.findUnique({
    where: { classeId_nom: { classeId, nom } },
  });
  if (doublon) retour(classeId, "COHORTE_DEJA_EXISTANTE");

  await prisma.$transaction([
    prisma.cohorte.create({ data: { classeId, nom } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "creation_cohorte",
        entite: "Cohorte",
        details: { classeId, nom },
      },
    }),
  ]);

  revalidatePath(`/classes/${classeId}`);
  retour(classeId);
}

export async function supprimerCohorteAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const classeId = champTexte(formData, "classeId");
  const cohorteId = champTexte(formData, "cohorteId");
  if (!classeId) redirect("/classes");
  if (!cohorteId) retour(classeId, "COHORTE_INTROUVABLE");

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

  revalidatePath(`/classes/${classeId}`);
  retour(classeId);
}

// Remplace intégralement les membres de la cohorte par la sélection reçue
// (mêmes principe que les enseignants dans modifierClasseAction ci-dessus) :
// plus simple qu'ajouter/retirer un par un, et couvre les deux à la fois.
export async function modifierMembresCohorteAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const classeId = champTexte(formData, "classeId");
  const cohorteId = champTexte(formData, "cohorteId");
  if (!classeId) redirect("/classes");
  if (!cohorteId) retour(classeId, "COHORTE_INTROUVABLE");

  const etudiantIds = formData.getAll("etudiants").filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  await prisma.$transaction([
    prisma.cohorteEtudiant.deleteMany({ where: { cohorteId } }),
    ...(etudiantIds.length > 0
      ? [
          prisma.cohorteEtudiant.createMany({
            data: etudiantIds.map((etudiantId) => ({ cohorteId, etudiantId })),
          }),
        ]
      : []),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_membres_cohorte",
        entite: "Cohorte",
        entiteId: cohorteId,
        details: { effectif: etudiantIds.length },
      },
    }),
  ]);

  revalidatePath(`/classes/${classeId}`);
  retour(classeId);
}

// Affecte en une fois tous les membres de la cohorte à une autre classe
// (création d'InscriptionClasse, comme inscrireEtudiantAction) : chaque
// inscription créée reste ensuite modifiable/retirable individuellement
// depuis la fiche de la classe cible, sans lien retour vers la cohorte.
export async function affecterCohorteAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const classeId = champTexte(formData, "classeId");
  const cohorteId = champTexte(formData, "cohorteId");
  const classeCibleId = champTexte(formData, "classeCibleId");
  if (!classeId) redirect("/classes");
  if (!cohorteId) retour(classeId, "COHORTE_INTROUVABLE");
  if (!classeCibleId) retour(classeId, "CLASSE_CIBLE_INVALIDE");

  const cohorte = await prisma.cohorte.findUnique({
    where: { id: cohorteId },
    include: { membres: true },
  });
  if (!cohorte) retour(classeId, "COHORTE_INTROUVABLE");
  if (cohorte.membres.length === 0) retour(classeId, "COHORTE_VIDE");

  const etudiantIds = cohorte.membres.map((m) => m.etudiantId);

  await prisma.$transaction([
    prisma.inscriptionClasse.createMany({
      data: etudiantIds.map((etudiantId) => ({ classeId: classeCibleId, etudiantId })),
      skipDuplicates: true,
    }),
    // Même effet que l'inscription individuelle : le souhait de section
    // exprimé à la préinscription est satisfait dès qu'une inscription
    // existe, quelle qu'elle soit (voir inscrireEtudiantAction).
    prisma.etudiant.updateMany({
      where: { id: { in: etudiantIds } },
      data: { sectionSouhaiteeId: null },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "affectation_cohorte",
        entite: "Cohorte",
        entiteId: cohorteId,
        details: { classeCibleId, effectif: etudiantIds.length },
      },
    }),
  ]);

  revalidatePath(`/classes/${classeId}`);
  revalidatePath(`/classes/${classeCibleId}`);
  retour(classeId);
}
