"use server";

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

export async function creerClasseAction(formData: FormData): Promise<void> {
  await requireModule(Module.CLASSES, "ECRITURE");

  const coursId = champTexte(formData, "coursId");
  const anneeScolaireId = champTexte(formData, "anneeScolaireId");
  const jour = champTexte(formData, "jour");
  const heureDebut = champTexte(formData, "heureDebut");
  const heureFin = champTexte(formData, "heureFin");

  if (!coursId || !anneeScolaireId || !estJourValide(jour) || !heureDebut || !heureFin) {
    redirect("/classes/nouveau?error=CHAMPS_MANQUANTS");
  }

  const niveau = champTexte(formData, "niveau");
  const semestre = champTexte(formData, "semestre");

  // Clé d'unicité métier : cours + niveau (le nom de la classe tel
  // qu'affiché, voir /classes) + année scolaire + session. Empêche de créer
  // deux fois la « même » classe sur la même période — un créneau différent
  // pour ce même cours/niveau/session reste, lui, une classe légitime.
  const classeExistante = await prisma.classe.findFirst({
    where: { coursId, anneeScolaireId, niveau, semestre },
  });
  if (classeExistante) {
    redirect("/classes/nouveau?error=CLASSE_DEJA_EXISTANTE");
  }

  const enseignantIds = formData.getAll("enseignants").filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  const classe = await prisma.classe.create({
    data: {
      coursId,
      anneeScolaireId,
      jour,
      heureDebut,
      heureFin,
      niveau,
      semestre,
      salle: champTexte(formData, "salle"),
      enseignants: {
        create: enseignantIds.map((utilisateurId) => ({ utilisateurId })),
      },
    },
  });

  redirect(`/classes/${classe.id}?ok=1`);
}
