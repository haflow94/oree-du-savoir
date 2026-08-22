import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import type { EnseignantAvecSections } from "@/lib/enseignants-section";

export type { EnseignantAvecSections } from "@/lib/enseignants-section";
export { filtrerParSection } from "@/lib/enseignants-section";

// Enseignants actifs, avec leurs spécialités (Section) déclarées sur le
// compte (voir Utilisateur.specialites dans schema.prisma). Sert à ne
// proposer, à la création/modification d'une classe, que les enseignants
// pertinents pour la section du cours choisi (voir
// lib/enseignants-section.ts#filtrerParSection). Côté serveur uniquement
// (importe Prisma) — le filtre pur vit dans enseignants-section.ts pour
// rester importable depuis un composant client.
export async function enseignantsActifsAvecSections(): Promise<EnseignantAvecSections[]> {
  const enseignants = await prisma.utilisateur.findMany({
    where: { role: Role.ENSEIGNANT, actif: true },
    orderBy: [{ nom: "asc" }],
    include: {
      specialites: { select: { id: true } },
    },
  });
  return enseignants.map((e) => ({
    id: e.id,
    prenom: e.prenom,
    nom: e.nom,
    sectionIds: e.specialites.map((s) => s.id),
  }));
}
