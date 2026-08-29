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

function retour(erreur?: string): never {
  redirect(erreur ? `/administration/salles?error=${erreur}` : "/administration/salles?ok=1");
}

export async function creerSalleAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const nom = champTexte(formData, "nom");
  if (!nom) retour("CHAMPS_INVALIDES");

  const existante = await prisma.salle.findUnique({ where: { nom } });
  if (existante) retour("NOM_DEJA_UTILISE");

  const creee = await prisma.salle.create({ data: { nom } });

  await prisma.journalAudit.create({
    data: {
      utilisateurId: session.id,
      action: "creation_salle",
      entite: "Salle",
      entiteId: creee.id,
      details: { nom },
    },
  });

  revalidatePath("/administration/salles");
  revalidatePath("/classes");
  retour();
}

export async function renommerSalleAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const salleId = champTexte(formData, "salleId");
  const nom = champTexte(formData, "nom");
  if (!salleId || !nom) retour("CHAMPS_INVALIDES");

  const cible = await prisma.salle.findUnique({ where: { id: salleId } });
  if (!cible) retour("INTROUVABLE");

  const homonyme = await prisma.salle.findUnique({ where: { nom } });
  if (homonyme && homonyme.id !== salleId) retour("NOM_DEJA_UTILISE");

  await prisma.$transaction([
    prisma.salle.update({ where: { id: salleId }, data: { nom } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_salle",
        entite: "Salle",
        entiteId: salleId,
        details: { avant: cible.nom, apres: nom },
      },
    }),
  ]);

  revalidatePath("/administration/salles");
  revalidatePath("/classes");
  retour();
}

export async function supprimerSalleAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const salleId = champTexte(formData, "salleId");
  if (!salleId) retour("CHAMPS_INVALIDES");

  const cible = await prisma.salle.findUnique({
    where: { id: salleId },
    include: { _count: { select: { classes: true } } },
  });
  if (!cible) retour("INTROUVABLE");

  // Une classe rattachée perdrait son accès QR rapide (salleId passe à null
  // en cascade, onDelete: SetNull) sans que personne ne l'ait décidé : on
  // demande d'abord de détacher/réaffecter ces classes depuis leur fiche.
  if (cible._count.classes > 0) retour("SALLE_UTILISEE");

  await prisma.$transaction([
    prisma.salle.delete({ where: { id: salleId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_salle",
        entite: "Salle",
        entiteId: salleId,
        details: { nom: cible.nom },
      },
    }),
  ]);

  revalidatePath("/administration/salles");
  revalidatePath("/classes");
  retour();
}
