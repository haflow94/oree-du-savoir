import "server-only";
import { prisma } from "@/lib/prisma";
import { dateFinParcours, estEligibleAnonymisation } from "@/lib/rgpd";

export async function etudiantsEligiblesAnonymisation() {
  const etudiants = await prisma.etudiant.findMany({
    where: { anonymiseLe: null },
    include: { dossiersAnnuels: { include: { anneeScolaire: true } } },
    orderBy: { nom: "asc" },
  });

  return etudiants
    .filter((etudiant) => estEligibleAnonymisation(etudiant))
    .map((etudiant) => ({ ...etudiant, finParcours: dateFinParcours(etudiant) }))
    .sort((a, b) => a.finParcours.getTime() - b.finParcours.getTime());
}
