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

function champDate(formData: FormData, nom: string): Date | null {
  const valeur = champTexte(formData, nom);
  if (!valeur) return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
}

function retour(erreur?: string): never {
  redirect(
    erreur
      ? `/administration/annees-scolaires?error=${erreur}`
      : "/administration/annees-scolaires?ok=1",
  );
}

export async function creerAnneeScolaireAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const libelle = champTexte(formData, "libelle");
  const dateDebut = champDate(formData, "dateDebut");
  const dateFin = champDate(formData, "dateFin");
  const activer = formData.get("activer") === "1";

  if (!libelle || !dateDebut || !dateFin) retour("CHAMPS_INVALIDES");
  if (dateFin <= dateDebut) retour("DATES_INVALIDES");

  const existante = await prisma.anneeScolaire.findUnique({ where: { libelle } });
  if (existante) retour("LIBELLE_DEJA_UTILISE");

  await prisma.$transaction(async (tx) => {
    if (activer) {
      await tx.anneeScolaire.updateMany({ data: { active: false } });
    }
    const c = await tx.anneeScolaire.create({
      data: { libelle, dateDebut, dateFin, active: activer },
    });
    await tx.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "creation_annee_scolaire",
        entite: "AnneeScolaire",
        entiteId: c.id,
        details: { libelle, active: activer },
      },
    });
  });

  revalidatePath("/administration/annees-scolaires");
  revalidatePath("/", "layout");
  retour();
}

export async function modifierAnneeScolaireAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const anneeId = champTexte(formData, "anneeId");
  const libelle = champTexte(formData, "libelle");
  const dateDebut = champDate(formData, "dateDebut");
  const dateFin = champDate(formData, "dateFin");

  if (!anneeId || !libelle || !dateDebut || !dateFin) retour("CHAMPS_INVALIDES");
  if (dateFin <= dateDebut) retour("DATES_INVALIDES");

  const cible = await prisma.anneeScolaire.findUnique({ where: { id: anneeId } });
  if (!cible) retour("INTROUVABLE");

  const homonyme = await prisma.anneeScolaire.findUnique({ where: { libelle } });
  if (homonyme && homonyme.id !== anneeId) retour("LIBELLE_DEJA_UTILISE");

  await prisma.$transaction([
    prisma.anneeScolaire.update({
      where: { id: anneeId },
      data: { libelle, dateDebut, dateFin },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_annee_scolaire",
        entite: "AnneeScolaire",
        entiteId: anneeId,
        details: { avant: cible, apres: { libelle, dateDebut, dateFin } },
      },
    }),
  ]);

  revalidatePath("/administration/annees-scolaires");
  revalidatePath("/", "layout");
  retour();
}

// Archive une année terminée : masque par défaut ses classes, séances et
// dossiers annuels des vues actives (Classes, Présences, Paiements) sans
// rien supprimer — voir AnneeScolaire.archivee dans schema.prisma.
export async function archiverAnneeScolaireAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const anneeId = champTexte(formData, "anneeId");
  if (!anneeId) retour("CHAMPS_INVALIDES");

  const cible = await prisma.anneeScolaire.findUnique({ where: { id: anneeId } });
  if (!cible) retour("INTROUVABLE");
  // Archiver l'année en cours d'utilisation la ferait disparaître des vues
  // actives par surprise ; il faut d'abord en activer une autre.
  if (cible.active) retour("ANNEE_ACTIVE");
  if (cible.archivee) retour();

  await prisma.$transaction([
    prisma.anneeScolaire.update({ where: { id: anneeId }, data: { archivee: true } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "archivage_annee_scolaire",
        entite: "AnneeScolaire",
        entiteId: anneeId,
        details: { libelle: cible.libelle },
      },
    }),
  ]);

  revalidatePath("/administration/annees-scolaires");
  revalidatePath("/classes");
  revalidatePath("/presences");
  revalidatePath("/paiements");
  retour();
}

// Réversible : aucune donnée n'est perdue en archivant, désarchiver suffit à
// tout faire réapparaître.
export async function desarchiverAnneeScolaireAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const anneeId = champTexte(formData, "anneeId");
  if (!anneeId) retour("CHAMPS_INVALIDES");

  const cible = await prisma.anneeScolaire.findUnique({ where: { id: anneeId } });
  if (!cible) retour("INTROUVABLE");
  if (!cible.archivee) retour();

  await prisma.$transaction([
    prisma.anneeScolaire.update({ where: { id: anneeId }, data: { archivee: false } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "desarchivage_annee_scolaire",
        entite: "AnneeScolaire",
        entiteId: anneeId,
        details: { libelle: cible.libelle },
      },
    }),
  ]);

  revalidatePath("/administration/annees-scolaires");
  revalidatePath("/classes");
  revalidatePath("/presences");
  revalidatePath("/paiements");
  retour();
}

export async function activerAnneeScolaireAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const anneeId = champTexte(formData, "anneeId");
  if (!anneeId) retour("CHAMPS_INVALIDES");

  const cible = await prisma.anneeScolaire.findUnique({ where: { id: anneeId } });
  if (!cible) retour("INTROUVABLE");
  if (cible.active) retour();

  await prisma.$transaction([
    prisma.anneeScolaire.updateMany({ data: { active: false } }),
    prisma.anneeScolaire.update({ where: { id: anneeId }, data: { active: true } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "activation_annee_scolaire",
        entite: "AnneeScolaire",
        entiteId: anneeId,
        details: { libelle: cible.libelle },
      },
    }),
  ]);

  revalidatePath("/administration/annees-scolaires");
  revalidatePath("/", "layout");
  retour();
}
