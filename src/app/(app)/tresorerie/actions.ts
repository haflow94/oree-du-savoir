"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MoyenPaiement, TypeMouvement } from "@/generated/prisma/enums";

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

export async function creerCategorieAction(formData: FormData): Promise<void> {
  await requireSession();
  const nom = champTexte(formData, "nom");
  if (!nom) return;

  await prisma.categorieMouvement.create({ data: { nom } });
  revalidatePath("/tresorerie");
}

export async function creerMouvementAction(formData: FormData): Promise<void> {
  await requireSession();

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
    return;
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
}
