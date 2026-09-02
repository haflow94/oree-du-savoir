"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MoyenPaiement, TypeMouvement } from "@/generated/prisma/enums";
import { requireModule, Module } from "@/lib/permissions";

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

function retourListe(erreur?: string): never {
  redirect(erreur ? `/tresorerie?error=${erreur}` : "/tresorerie?ok=1");
}

export async function creerCategorieAction(formData: FormData): Promise<void> {
  await requireModule(Module.TRESORERIE, "ECRITURE");
  const nom = champTexte(formData, "nom");
  if (!nom) retourListe("CHAMPS_MANQUANTS");

  await prisma.categorieMouvement.create({ data: { nom } });
  revalidatePath("/tresorerie");
  retourListe();
}

export async function modifierCategorieAction(formData: FormData): Promise<void> {
  await requireModule(Module.TRESORERIE, "ECRITURE");
  const categorieId = champTexte(formData, "categorieId");
  const nom = champTexte(formData, "nom");
  if (!categorieId || !nom) retourListe("CHAMPS_MANQUANTS");

  await prisma.categorieMouvement.update({ where: { id: categorieId }, data: { nom } });
  revalidatePath("/tresorerie");
  retourListe();
}

export async function changerActivationCategorieAction(formData: FormData): Promise<void> {
  await requireModule(Module.TRESORERIE, "ECRITURE");
  const categorieId = champTexte(formData, "categorieId");
  const actif = formData.get("actif") === "1";
  if (!categorieId) retourListe("CHAMPS_MANQUANTS");

  await prisma.categorieMouvement.update({ where: { id: categorieId }, data: { actif } });
  revalidatePath("/tresorerie");
  retourListe();
}

export async function creerMouvementAction(formData: FormData): Promise<void> {
  await requireModule(Module.TRESORERIE, "ECRITURE");

  const date = champTexte(formData, "date");
  const libelle = champTexte(formData, "libelle");
  const typeBrut = champTexte(formData, "type");
  const moyenBrut = champTexte(formData, "moyen");
  const montant = champTexte(formData, "montant");

  if (
    !date ||
    !libelle ||
    !montant ||
    !typeBrut ||
    !(typeBrut in TypeMouvement) ||
    !moyenBrut ||
    !(moyenBrut in MoyenPaiement)
  ) {
    retourListe("CHAMPS_INVALIDES");
  }

  await prisma.mouvementTresorerie.create({
    data: {
      date: new Date(date),
      libelle,
      montant,
      type: typeBrut as TypeMouvement,
      moyen: moyenBrut as MoyenPaiement,
      categorieId: champTexte(formData, "categorieId"),
      justificatif: champTexte(formData, "justificatif"),
    },
  });

  revalidatePath("/tresorerie");
  retourListe();
}

function retourMouvement(mouvementId: string, erreur?: string): never {
  redirect(
    erreur
      ? `/tresorerie/${mouvementId}?error=${erreur}`
      : `/tresorerie/${mouvementId}?ok=1`,
  );
}

export async function modifierMouvementAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.TRESORERIE, "ECRITURE");

  const mouvementId = champTexte(formData, "mouvementId");
  const date = champTexte(formData, "date");
  const libelle = champTexte(formData, "libelle");
  const typeBrut = champTexte(formData, "type");
  const moyenBrut = champTexte(formData, "moyen");
  const montant = champTexte(formData, "montant");
  if (!mouvementId) redirect("/tresorerie");

  const existant = await prisma.mouvementTresorerie.findUnique({ where: { id: mouvementId } });
  if (!existant) redirect("/tresorerie");
  // Généré automatiquement depuis un paiement (voir enregistrerPaiementAction,
  // paiements/[id]/actions.ts) : la correction passe par la fiche paiement,
  // qui resynchronise ce mouvement, jamais par ce formulaire.
  if (existant.paiementId) retourMouvement(mouvementId, "MOUVEMENT_LIE_PAIEMENT");

  if (
    !date ||
    !libelle ||
    !montant ||
    !typeBrut ||
    !(typeBrut in TypeMouvement) ||
    !moyenBrut ||
    !(moyenBrut in MoyenPaiement)
  ) {
    retourMouvement(mouvementId, "CHAMPS_INVALIDES");
  }

  await prisma.$transaction([
    prisma.mouvementTresorerie.update({
      where: { id: mouvementId },
      data: {
        date: new Date(date),
        libelle,
        montant,
        type: typeBrut as TypeMouvement,
        moyen: moyenBrut as MoyenPaiement,
        categorieId: champTexte(formData, "categorieId"),
        justificatif: champTexte(formData, "justificatif"),
      },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_mouvement",
        entite: "MouvementTresorerie",
        entiteId: mouvementId,
      },
    }),
  ]);

  revalidatePath("/tresorerie");
  retourMouvement(mouvementId);
}

export async function supprimerMouvementAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.TRESORERIE, "ECRITURE");

  const mouvementId = champTexte(formData, "mouvementId");
  if (!mouvementId) redirect("/tresorerie");

  const cible = await prisma.mouvementTresorerie.findUnique({ where: { id: mouvementId } });
  if (!cible) redirect("/tresorerie");
  if (cible.paiementId) retourMouvement(mouvementId, "MOUVEMENT_LIE_PAIEMENT");

  await prisma.$transaction([
    prisma.mouvementTresorerie.delete({ where: { id: mouvementId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_mouvement",
        entite: "MouvementTresorerie",
        entiteId: mouvementId,
        details: { libelle: cible.libelle, montant: cible.montant.toString() },
      },
    }),
  ]);

  revalidatePath("/tresorerie");
  redirect("/tresorerie?ok=1");
}
