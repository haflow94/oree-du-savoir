import "server-only";
import { prisma } from "@/lib/prisma";
import { StatutPlaceClasse } from "@/generated/prisma/enums";

// Premier arrivé, premier servi sur les places déjà confirmées de la classe —
// que le dossier de l'étudiant soit déjà validé ou encore en préinscription.
// Pas de capacité (capacite null) = jamais de liste d'attente.
export async function statutPourNouvelleInscription(
  classeId: string,
): Promise<StatutPlaceClasse> {
  const classe = await prisma.classe.findUnique({
    where: { id: classeId },
    select: { capacite: true },
  });
  if (!classe?.capacite) return "CONFIRMEE";

  const nbConfirmees = await prisma.inscriptionClasse.count({
    where: { classeId, statut: "CONFIRMEE" },
  });
  return nbConfirmees < classe.capacite ? "CONFIRMEE" : "LISTE_ATTENTE";
}

// À appeler après le retrait d'une inscription confirmée : la place libérée
// revient à la plus ancienne inscription en liste d'attente pour cette classe.
export async function promouvoirProchainEnAttente(classeId: string): Promise<void> {
  const prochain = await prisma.inscriptionClasse.findFirst({
    where: { classeId, statut: "LISTE_ATTENTE" },
    orderBy: { creeLe: "asc" },
  });
  if (!prochain) return;

  await prisma.inscriptionClasse.update({
    where: { id: prochain.id },
    data: { statut: "CONFIRMEE" },
  });
}
