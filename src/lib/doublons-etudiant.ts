import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

// Champs utilisés par la popup de comparaison (doublon-popup.tsx) pour
// afficher les deux fiches côte à côte — partagés entre la fiche étudiant
// et la liste centralisée /etudiants/doublons pour éviter que les deux
// vues divergent sur les champs comparés.
export const champsComparaisonDoublon = {
  id: true,
  civilite: true,
  nom: true,
  prenom: true,
  dateNaissance: true,
  villeNaissance: true,
  telephoneMobile: true,
  telephoneFixe: true,
  email: true,
  adresse: true,
  codePostal: true,
  ville: true,
  statutInscription: true,
  creeLe: true,
} satisfies Prisma.EtudiantSelect;

export type FicheComparaisonDoublon = Prisma.EtudiantGetPayload<{
  select: typeof champsComparaisonDoublon;
}>;

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

// La détection ci-dessus ne tourne qu'à la création (préinscription) : une
// fois la fiche créée, corriger une faute de frappe sur le nom/prénom/date
// de naissance (voir modifierEtudiantAction) ne la déclenche jamais, un
// vrai doublon peut donc rester invisible indéfiniment après une correction
// après coup. Neutre si cette fiche porte déjà un signalement en cours (ne
// pas écraser une décision en attente) ou si l'autre fiche trouvée a déjà
// été tranchée (fusion/homonymie) — pose toujours le signalement sur la
// fiche la plus récente des deux, jamais sur la plus ancienne, pour rester
// cohérent avec le sens supposé par fusionnerDoublonAction.
export async function redetecterDoublonApresModification(etudiantId: string): Promise<void> {
  const etudiant = await prisma.etudiant.findUnique({
    where: { id: etudiantId },
    select: { id: true, nom: true, prenom: true, dateNaissance: true, creeLe: true, doublonPotentielId: true },
  });
  if (!etudiant || etudiant.doublonPotentielId || !etudiant.dateNaissance) return;

  const autre = await prisma.etudiant.findFirst({
    where: {
      id: { not: etudiant.id },
      nom: { equals: etudiant.nom, mode: "insensitive" },
      prenom: { equals: etudiant.prenom, mode: "insensitive" },
      dateNaissance: etudiant.dateNaissance,
    },
    orderBy: { creeLe: "asc" },
    select: { id: true, creeLe: true, doublonPotentielId: true },
  });
  if (!autre) return;

  if (autre.creeLe < etudiant.creeLe) {
    await prisma.etudiant.update({ where: { id: etudiant.id }, data: { doublonPotentielId: autre.id } });
  } else if (!autre.doublonPotentielId) {
    await prisma.etudiant.update({ where: { id: autre.id }, data: { doublonPotentielId: etudiant.id } });
  }
}
