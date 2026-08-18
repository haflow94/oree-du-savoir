"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";

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

function retour(erreur?: string): never {
  redirect(
    erreur
      ? `/administration/sections?error=${erreur}`
      : "/administration/sections?ok=1",
  );
}

export async function creerSectionAction(formData: FormData): Promise<void> {
  const session = await requireRole([Role.ADMINISTRATION, Role.BUREAU]);

  const nom = champTexte(formData, "nom");
  const fraisFormation = champMontant(formData, "fraisFormation");
  const fraisDossier = champMontant(formData, "fraisDossier");
  const volumeHoraireAnnuel = champHeuresOptionnel(formData, "volumeHoraireAnnuel");
  const remboursementAvant15Jours = champPourcentage(formData, "remboursementAvant15Jours");
  const remboursementAvant29Jours = champPourcentage(formData, "remboursementAvant29Jours");

  if (
    !nom ||
    !fraisFormation ||
    !fraisDossier ||
    volumeHoraireAnnuel === undefined ||
    remboursementAvant15Jours === null ||
    remboursementAvant29Jours === null
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
  const session = await requireRole([Role.ADMINISTRATION, Role.BUREAU]);

  const sectionId = champTexte(formData, "sectionId");
  const nom = champTexte(formData, "nom");
  const fraisFormation = champMontant(formData, "fraisFormation");
  const fraisDossier = champMontant(formData, "fraisDossier");
  const volumeHoraireAnnuel = champHeuresOptionnel(formData, "volumeHoraireAnnuel");
  const remboursementAvant15Jours = champPourcentage(formData, "remboursementAvant15Jours");
  const remboursementAvant29Jours = champPourcentage(formData, "remboursementAvant29Jours");

  if (
    !sectionId ||
    !nom ||
    !fraisFormation ||
    !fraisDossier ||
    volumeHoraireAnnuel === undefined ||
    remboursementAvant15Jours === null ||
    remboursementAvant29Jours === null
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
  const session = await requireRole([Role.ADMINISTRATION, Role.BUREAU]);

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
