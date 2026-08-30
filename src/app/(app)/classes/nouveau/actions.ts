"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

export async function creerClasseAction(formData: FormData): Promise<void> {
  await requireModule(Module.CLASSES, "ECRITURE");

  const cohorteId = champTexte(formData, "cohorteId");
  const anneeScolaireId = champTexte(formData, "anneeScolaireId");
  const heureDebut = champTexte(formData, "heureDebut");
  const heureFin = champTexte(formData, "heureFin");

  if (!cohorteId || !anneeScolaireId || !heureDebut || !heureFin) {
    redirect("/classes/nouveau?error=CHAMPS_MANQUANTS");
  }

  const semestre = champTexte(formData, "semestre");

  // Clé d'unicité métier : cohorte (cours + niveau + jour, voir
  // Cohorte dans prisma/schema.prisma) + année scolaire + session. Empêche de
  // créer deux fois la « même » classe sur la même période.
  const classeExistante = await prisma.classe.findFirst({
    where: { cohorteId, anneeScolaireId, semestre },
  });
  if (classeExistante) {
    redirect("/classes/nouveau?error=CLASSE_DEJA_EXISTANTE");
  }

  const enseignantIds = formData.getAll("enseignants").filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  const classe = await prisma.classe.create({
    data: {
      cohorteId,
      anneeScolaireId,
      heureDebut,
      heureFin,
      semestre,
      salleId: champTexte(formData, "salleId"),
      enseignants: {
        create: enseignantIds.map((utilisateurId) => ({ utilisateurId })),
      },
    },
  });

  redirect(`/classes/${classe.id}?ok=1`);
}
