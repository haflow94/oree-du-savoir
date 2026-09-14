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

// Retourne `undefined` pour une capacité invalide (le champ est optionnel :
// vide = illimité, pas une erreur), à distinguer de `null` (illimité choisi
// explicitement).
function capaciteMaxDepuisFormData(formData: FormData): number | null | undefined {
  const brut = String(formData.get("capaciteMax") ?? "").trim();
  if (!brut) return null;
  const valeur = Number(brut);
  if (!Number.isInteger(valeur) || valeur < 1) return undefined;
  return valeur;
}

export async function creerSalleAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const nom = champTexte(formData, "nom");
  if (!nom) retour("CHAMPS_INVALIDES");
  const capaciteMax = capaciteMaxDepuisFormData(formData);
  if (capaciteMax === undefined) retour("CAPACITE_INVALIDE");

  const existante = await prisma.salle.findUnique({ where: { nom } });
  if (existante) retour("NOM_DEJA_UTILISE");

  const creee = await prisma.salle.create({ data: { nom, capaciteMax } });

  await prisma.journalAudit.create({
    data: {
      utilisateurId: session.id,
      action: "creation_salle",
      entite: "Salle",
      entiteId: creee.id,
      details: { nom, capaciteMax },
    },
  });

  revalidatePath("/administration/salles");
  revalidatePath("/classes");
  retour();
}

export async function modifierSalleAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const salleId = champTexte(formData, "salleId");
  const nom = champTexte(formData, "nom");
  if (!salleId || !nom) retour("CHAMPS_INVALIDES");
  const capaciteMax = capaciteMaxDepuisFormData(formData);
  if (capaciteMax === undefined) retour("CAPACITE_INVALIDE");

  const cible = await prisma.salle.findUnique({ where: { id: salleId } });
  if (!cible) retour("INTROUVABLE");

  const homonyme = await prisma.salle.findUnique({ where: { nom } });
  if (homonyme && homonyme.id !== salleId) retour("NOM_DEJA_UTILISE");

  await prisma.$transaction([
    prisma.salle.update({ where: { id: salleId }, data: { nom, capaciteMax } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_salle",
        entite: "Salle",
        entiteId: salleId,
        details: {
          avant: { nom: cible.nom, capaciteMax: cible.capaciteMax },
          apres: { nom, capaciteMax },
        },
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
    include: {
      _count: { select: { classes: { where: { anneeScolaire: { archivee: false } } } } },
    },
  });
  if (!cible) retour("INTROUVABLE");

  // Une classe rattachée perdrait son accès QR rapide (salleId passe à null
  // en cascade, onDelete: SetNull) sans que personne ne l'ait décidé : on
  // demande d'abord de détacher/réaffecter ces classes depuis leur fiche.
  // Les classes d'une année scolaire archivée sont exclues du calcul :
  // masquées par défaut des vues actives (voir Classes), elles ne doivent
  // pas bloquer une suppression qui, de toute façon, ne fait que mettre
  // leur salleId à null sans rien supprimer côté historique.
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
