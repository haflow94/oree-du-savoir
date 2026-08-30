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
  const heureDebut = champTexte(formData, "heureDebut");
  const heureFin = champTexte(formData, "heureFin");
  if (!classeId) redirect("/classes");
  if (!cohorteId || !heureDebut || !heureFin) {
    retour(classeId, "CHAMPS_MANQUANTS");
  }

  const semestre = champTexte(formData, "semestre");

  const classeActuelle = await prisma.classe.findUnique({ where: { id: classeId } });
  if (!classeActuelle) redirect("/classes");

  // Même garde-fou qu'à la création (voir classes/nouveau/actions.ts) :
  // modifier la cohorte/la session d'une classe ne doit pas non plus aboutir
  // à deux classes strictement identiques sur la même période.
  const doublon = await prisma.classe.findFirst({
    where: {
      id: { not: classeId },
      cohorteId,
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

// Les actions de groupe d'étudiants sont rattachées au module Étudiants
// (comme inscrireEtudiantAction/retirerEtudiantAction dans
// presences/actions.ts) : un groupe n'est qu'un raccourci de sélection pour
// affecter des étudiants à une classe, pas un attribut de la classe elle-même.
export async function creerGroupeEtudiantsAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const classeId = champTexte(formData, "classeId");
  const nom = champTexte(formData, "nom");
  if (!classeId) redirect("/classes");
  if (!nom) retour(classeId, "GROUPE_NOM_MANQUANT");

  const doublon = await prisma.groupeEtudiants.findUnique({
    where: { classeId_nom: { classeId, nom } },
  });
  if (doublon) retour(classeId, "GROUPE_DEJA_EXISTANT");

  await prisma.$transaction([
    prisma.groupeEtudiants.create({ data: { classeId, nom } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "creation_groupe_etudiants",
        entite: "GroupeEtudiants",
        details: { classeId, nom },
      },
    }),
  ]);

  revalidatePath(`/classes/${classeId}`);
  retour(classeId);
}

export async function supprimerGroupeEtudiantsAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const classeId = champTexte(formData, "classeId");
  const groupeId = champTexte(formData, "groupeId");
  if (!classeId) redirect("/classes");
  if (!groupeId) retour(classeId, "GROUPE_INTROUVABLE");

  await prisma.$transaction([
    prisma.groupeEtudiants.delete({ where: { id: groupeId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_groupe_etudiants",
        entite: "GroupeEtudiants",
        entiteId: groupeId,
      },
    }),
  ]);

  revalidatePath(`/classes/${classeId}`);
  retour(classeId);
}

// Remplace intégralement les membres du groupe par la sélection reçue (même
// principe que les enseignants dans modifierClasseAction ci-dessus) : plus
// simple qu'ajouter/retirer un par un, et couvre les deux à la fois.
export async function modifierMembresGroupeEtudiantsAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const classeId = champTexte(formData, "classeId");
  const groupeId = champTexte(formData, "groupeId");
  if (!classeId) redirect("/classes");
  if (!groupeId) retour(classeId, "GROUPE_INTROUVABLE");

  const etudiantIds = formData.getAll("etudiants").filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  await prisma.$transaction([
    prisma.groupeEtudiantsMembre.deleteMany({ where: { groupeEtudiantsId: groupeId } }),
    ...(etudiantIds.length > 0
      ? [
          prisma.groupeEtudiantsMembre.createMany({
            data: etudiantIds.map((etudiantId) => ({ groupeEtudiantsId: groupeId, etudiantId })),
          }),
        ]
      : []),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_membres_groupe_etudiants",
        entite: "GroupeEtudiants",
        entiteId: groupeId,
        details: { effectif: etudiantIds.length },
      },
    }),
  ]);

  revalidatePath(`/classes/${classeId}`);
  retour(classeId);
}

// Affecte en une fois tous les membres du groupe à une autre classe (création
// d'InscriptionClasse, comme inscrireEtudiantAction) : chaque inscription
// créée reste ensuite modifiable/retirable individuellement depuis la fiche
// de la classe cible, sans lien retour vers le groupe.
export async function affecterGroupeEtudiantsAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const classeId = champTexte(formData, "classeId");
  const groupeId = champTexte(formData, "groupeId");
  const classeCibleId = champTexte(formData, "classeCibleId");
  if (!classeId) redirect("/classes");
  if (!groupeId) retour(classeId, "GROUPE_INTROUVABLE");
  if (!classeCibleId) retour(classeId, "CLASSE_CIBLE_INVALIDE");

  const groupe = await prisma.groupeEtudiants.findUnique({
    where: { id: groupeId },
    include: { membres: true },
  });
  if (!groupe) retour(classeId, "GROUPE_INTROUVABLE");
  if (groupe.membres.length === 0) retour(classeId, "GROUPE_VIDE");

  const etudiantIds = groupe.membres.map((m) => m.etudiantId);

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
        action: "affectation_groupe_etudiants",
        entite: "GroupeEtudiants",
        entiteId: groupeId,
        details: { classeCibleId, effectif: etudiantIds.length },
      },
    }),
  ]);

  revalidatePath(`/classes/${classeId}`);
  revalidatePath(`/classes/${classeCibleId}`);
  retour(classeId);
}
