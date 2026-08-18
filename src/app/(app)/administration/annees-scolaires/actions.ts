"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";

const PEUT_GERER = [Role.ADMINISTRATION, Role.BUREAU];

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
  const session = await requireRole(PEUT_GERER);

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
  const session = await requireRole(PEUT_GERER);

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

export async function activerAnneeScolaireAction(formData: FormData): Promise<void> {
  const session = await requireRole(PEUT_GERER);

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
