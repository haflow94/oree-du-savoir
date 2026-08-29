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

/** Montant en euros type "490" ou "490.50" ; refuse tout le reste (pas de calcul, pas d'inférence). */
function champMontant(formData: FormData, nom: string): string | null {
  const valeur = champTexte(formData, nom);
  if (!valeur || !/^\d+(\.\d{1,2})?$/.test(valeur)) return null;
  return valeur;
}

/** Pourcentage entier 0-100. */
function champPourcentage(formData: FormData, nom: string): number | null {
  const valeur = champTexte(formData, nom);
  if (!valeur) return null;
  const n = Number.parseInt(valeur, 10);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
}

/** Entier positif optionnel (volume horaire) : null si non renseigné, undefined si invalide. */
function champHeuresOptionnel(formData: FormData, nom: string): number | null | undefined {
  const valeur = champTexte(formData, nom);
  if (!valeur) return null;
  const n = Number.parseInt(valeur, 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Une ligne = une règle spécifique à la section (bloc "Dispositions propres à la section" du dossier). */
function champListeLignes(formData: FormData, nom: string): string[] {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return [];
  return valeur
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.length > 0);
}

function champModeleDossier(formData: FormData): "ADULTES" | "JEUNES" | null {
  const valeur = champTexte(formData, "modeleDossier");
  return valeur === "ADULTES" || valeur === "JEUNES" ? valeur : null;
}

function retour(erreur?: string): never {
  redirect(
    erreur
      ? `/administration/sections?error=${erreur}`
      : "/administration/sections?ok=1",
  );
}

export async function creerSectionAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const nom = champTexte(formData, "nom");
  const fraisFormation = champMontant(formData, "fraisFormation");
  const fraisDossier = champMontant(formData, "fraisDossier");
  const volumeHoraireAnnuel = champHeuresOptionnel(formData, "volumeHoraireAnnuel");
  const remboursementAvant15Jours = champPourcentage(formData, "remboursementAvant15Jours");
  const remboursementAvant29Jours = champPourcentage(formData, "remboursementAvant29Jours");
  const modeleDossier = champModeleDossier(formData);
  const reglesSpecifiques = champListeLignes(formData, "reglesSpecifiques");

  if (
    !nom ||
    !fraisFormation ||
    !fraisDossier ||
    volumeHoraireAnnuel === undefined ||
    remboursementAvant15Jours === null ||
    remboursementAvant29Jours === null ||
    !modeleDossier
  ) {
    retour("CHAMPS_INVALIDES");
  }

  const existante = await prisma.section.findUnique({ where: { nom } });
  if (existante) retour("NOM_DEJA_UTILISE");

  const creee = await prisma.section.create({
    data: {
      nom,
      fraisFormation,
      fraisDossier,
      volumeHoraireAnnuel,
      remboursementAvant15Jours,
      remboursementAvant29Jours,
      modeleDossier,
      reglesSpecifiques,
    },
  });

  await prisma.journalAudit.create({
    data: {
      utilisateurId: session.id,
      action: "creation_section",
      entite: "Section",
      entiteId: creee.id,
      details: { nom },
    },
  });

  revalidatePath("/administration/sections");
  revalidatePath("/classes");
  retour();
}

export async function modifierSectionAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const sectionId = champTexte(formData, "sectionId");
  const nom = champTexte(formData, "nom");
  const fraisFormation = champMontant(formData, "fraisFormation");
  const fraisDossier = champMontant(formData, "fraisDossier");
  const volumeHoraireAnnuel = champHeuresOptionnel(formData, "volumeHoraireAnnuel");
  const remboursementAvant15Jours = champPourcentage(formData, "remboursementAvant15Jours");
  const remboursementAvant29Jours = champPourcentage(formData, "remboursementAvant29Jours");
  const modeleDossier = champModeleDossier(formData);
  const reglesSpecifiques = champListeLignes(formData, "reglesSpecifiques");

  if (
    !sectionId ||
    !nom ||
    !fraisFormation ||
    !fraisDossier ||
    volumeHoraireAnnuel === undefined ||
    remboursementAvant15Jours === null ||
    remboursementAvant29Jours === null ||
    !modeleDossier
  ) {
    retour("CHAMPS_INVALIDES");
  }

  const cible = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!cible) retour("INTROUVABLE");

  const homonyme = await prisma.section.findUnique({ where: { nom } });
  if (homonyme && homonyme.id !== sectionId) retour("NOM_DEJA_UTILISE");

  await prisma.$transaction([
    prisma.section.update({
      where: { id: sectionId },
      data: {
        nom,
        fraisFormation,
        fraisDossier,
        volumeHoraireAnnuel,
        remboursementAvant15Jours,
        remboursementAvant29Jours,
        modeleDossier,
        reglesSpecifiques,
      },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_section",
        entite: "Section",
        entiteId: sectionId,
        details: { avant: cible, apres: { nom, fraisFormation, fraisDossier } },
      },
    }),
  ]);

  revalidatePath("/administration/sections");
  revalidatePath("/classes");
  retour();
}

export async function supprimerSectionAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const sectionId = champTexte(formData, "sectionId");
  if (!sectionId) retour("CHAMPS_INVALIDES");

  const cible = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { _count: { select: { cours: true } } },
  });
  if (!cible) retour("INTROUVABLE");

  // Un cours pointe vers sa section (onDelete: Restrict) : la supprimer la
  // laisserait sans référentiel de tarification. Il faut d'abord déplacer
  // ou supprimer ces cours depuis la page Classes.
  if (cible._count.cours > 0) retour("SECTION_UTILISEE");

  await prisma.$transaction([
    prisma.section.delete({ where: { id: sectionId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_section",
        entite: "Section",
        entiteId: sectionId,
        details: { nom: cible.nom },
      },
    }),
  ]);

  revalidatePath("/administration/sections");
  revalidatePath("/classes");
  retour();
}

// Créneaux affichés sur le dossier d'inscription de la section (voir modèle
// CreneauSection) : catalogue simple, pas de contrainte d'unicité ni de
// dépendance à supprimer avant — une section peut toujours modifier/vider
// ses créneaux librement.
export async function ajouterCreneauAction(formData: FormData): Promise<void> {
  await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const sectionId = champTexte(formData, "sectionId");
  const code = champTexte(formData, "code");
  const jour = champTexte(formData, "jour");
  const horaire = champTexte(formData, "horaire");
  const restriction = champTexte(formData, "restriction");

  if (!sectionId || !code || !jour || !horaire) retour("CHAMPS_INVALIDES");

  const section = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!section) retour("INTROUVABLE");

  const nombreExistant = await prisma.creneauSection.count({ where: { sectionId } });
  await prisma.creneauSection.create({
    data: { sectionId, code, jour, horaire, restriction, ordre: nombreExistant },
  });

  revalidatePath("/administration/sections");
  retour();
}

export async function supprimerCreneauAction(formData: FormData): Promise<void> {
  await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const creneauId = champTexte(formData, "creneauId");
  if (!creneauId) retour("CHAMPS_INVALIDES");

  await prisma.creneauSection.delete({ where: { id: creneauId } }).catch(() => null);

  revalidatePath("/administration/sections");
  retour();
}
