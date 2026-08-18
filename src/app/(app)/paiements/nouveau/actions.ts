"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";

export async function creerDossierAction(formData: FormData): Promise<void> {
  await requireRole([Role.ACCUEIL, Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU]);

  const etudiantId = String(formData.get("etudiantId") ?? "").trim();
  const anneeScolaireId = String(formData.get("anneeScolaireId") ?? "").trim();
  const montantDu = String(formData.get("montantDu") ?? "").trim();

  if (!etudiantId || !anneeScolaireId || !montantDu) {
    redirect("/paiements/nouveau?error=CHAMPS_MANQUANTS");
  }

  const existant = await prisma.dossierAnnuel.findUnique({
    where: { etudiantId_anneeScolaireId: { etudiantId, anneeScolaireId } },
  });
  if (existant) {
    redirect(`/paiements/${existant.id}?error=DOSSIER_EXISTANT`);
  }

  const dossier = await prisma.dossierAnnuel.create({
    data: { etudiantId, anneeScolaireId, montantDu },
  });

  redirect(`/paiements/${dossier.id}`);
}
