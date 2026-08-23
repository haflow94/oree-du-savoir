import "server-only";
import { prisma } from "@/lib/prisma";

// Clé d'unicité métier (voir CLAUDE.md et Etudiant.doublonPotentielId) :
// nom + prénom + date de naissance en priorité, complétée par le
// téléphone/email d'un responsable quand la date de naissance n'est pas
// encore connue (cas fréquent à la préinscription en ligne). Une seule
// correspondance suffit : on remonte la plus ancienne fiche (`creeLe asc`)
// pour toujours pointer vers le dossier « historique » plutôt qu'un autre
// doublon plus récent.
export async function trouverDoublonEtudiant({
  nom,
  prenom,
  dateNaissance,
  telephoneResponsable,
  emailResponsable,
}: {
  nom: string;
  prenom: string;
  dateNaissance: Date | null;
  telephoneResponsable?: string | null;
  emailResponsable?: string | null;
}): Promise<{ id: string; nom: string; prenom: string } | null> {
  if (dateNaissance) {
    const parDateNaissance = await prisma.etudiant.findFirst({
      where: {
        nom: { equals: nom, mode: "insensitive" },
        prenom: { equals: prenom, mode: "insensitive" },
        dateNaissance,
      },
      orderBy: { creeLe: "asc" },
      select: { id: true, nom: true, prenom: true },
    });
    if (parDateNaissance) return parDateNaissance;
  }

  if (telephoneResponsable || emailResponsable) {
    const parCoordonneesResponsable = await prisma.etudiant.findFirst({
      where: {
        nom: { equals: nom, mode: "insensitive" },
        prenom: { equals: prenom, mode: "insensitive" },
        responsables: {
          some: {
            OR: [
              ...(telephoneResponsable ? [{ telephone: telephoneResponsable }] : []),
              ...(emailResponsable
                ? [{ email: { equals: emailResponsable, mode: "insensitive" as const } }]
                : []),
            ],
          },
        },
      },
      orderBy: { creeLe: "asc" },
      select: { id: true, nom: true, prenom: true },
    });
    if (parCoordonneesResponsable) return parCoordonneesResponsable;
  }

  return null;
}
