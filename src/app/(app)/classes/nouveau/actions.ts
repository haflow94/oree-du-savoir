"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JourSemaine } from "@/generated/prisma/enums";

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
  await requireSession();

  const coursId = champTexte(formData, "coursId");
  const anneeScolaireId = champTexte(formData, "anneeScolaireId");
  const jour = champTexte(formData, "jour");
  const heureDebut = champTexte(formData, "heureDebut");
  const heureFin = champTexte(formData, "heureFin");

  if (!coursId || !anneeScolaireId || !estJourValide(jour) || !heureDebut || !heureFin) {
    redirect("/classes/nouveau?error=CHAMPS_MANQUANTS");
  }

  const capaciteBrute = champTexte(formData, "capacite");
  const capacite = capaciteBrute ? Number.parseInt(capaciteBrute, 10) : null;

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
      niveau: champTexte(formData, "niveau"),
      semestre: champTexte(formData, "semestre"),
      salle: champTexte(formData, "salle"),
      capacite: capacite && !Number.isNaN(capacite) ? capacite : null,
      enseignants: {
        create: enseignantIds.map((utilisateurId) => ({ utilisateurId })),
      },
    },
  });

  redirect(`/classes?creee=${classe.id}`);
}
