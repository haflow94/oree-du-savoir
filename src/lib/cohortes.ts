import { prisma } from "@/lib/prisma";

export type ResultatAffectationCohorte =
  | { statut: "COHORTE_INTROUVABLE" }
  | { statut: "DEJA_AFFECTE" }
  | { statut: "AFFECTE" }
  | { statut: "EN_ATTENTE" };

// Affecte un étudiant à une Cohorte pour une année scolaire donnée : respecte
// la capacité (Cohorte.capaciteMax), met en liste d'attente si complet, et
// inscrit automatiquement l'étudiant à chaque Classe déjà créée pour ce bloc
// cette année (fan-out tout ou rien sur les Cours de la Cohorte — voir
// prisma/schema.prisma#AffectationCohorte). No-op silencieux sur les Classes
// si aucune n'existe encore pour ce bloc cette année (affectation
// administrative en attendant que le staff les crée).
//
// Unique point d'entrée pour affecter une Cohorte : partagé entre la
// création du dossier de paiement (paiements/nouveau) et l'inscription
// directe depuis la fiche étudiant, pour qu'aucun des deux chemins ne
// contourne la capacité/liste d'attente de l'autre.
export async function affecterEtudiantACohorte({
  etudiantId,
  cohorteId,
  anneeScolaireId,
  utilisateurId,
}: {
  etudiantId: string;
  cohorteId: string;
  anneeScolaireId: string;
  utilisateurId: string;
}): Promise<ResultatAffectationCohorte> {
  const cohorte = await prisma.cohorte.findUnique({ where: { id: cohorteId } });
  if (!cohorte) return { statut: "COHORTE_INTROUVABLE" };

  const dejaAffecte = await prisma.affectationCohorte.findUnique({
    where: { etudiantId_cohorteId_anneeScolaireId: { etudiantId, cohorteId, anneeScolaireId } },
  });
  if (dejaAffecte) return { statut: "DEJA_AFFECTE" };

  const [classesDuBloc, compteAffectes, compteEnAttente] = await Promise.all([
    prisma.classe.findMany({ where: { cohorteId, anneeScolaireId }, select: { id: true } }),
    prisma.affectationCohorte.count({
      where: { cohorteId, anneeScolaireId, statut: "AFFECTE" },
    }),
    prisma.affectationCohorte.count({
      where: { cohorteId, anneeScolaireId, statut: "EN_ATTENTE" },
    }),
  ]);
  const placeDisponible = cohorte.capaciteMax === null || compteAffectes < cohorte.capaciteMax;

  await prisma.$transaction([
    prisma.affectationCohorte.create({
      data: {
        etudiantId,
        cohorteId,
        anneeScolaireId,
        statut: placeDisponible ? "AFFECTE" : "EN_ATTENTE",
        rangListeAttente: placeDisponible ? null : compteEnAttente + 1,
      },
    }),
    ...(placeDisponible && classesDuBloc.length > 0
      ? [
          prisma.inscriptionClasse.createMany({
            data: classesDuBloc.map((c) => ({ etudiantId, classeId: c.id })),
            skipDuplicates: true,
          }),
        ]
      : []),
    prisma.journalAudit.create({
      data: {
        utilisateurId,
        action: placeDisponible ? "affectation_cohorte" : "mise_en_attente_cohorte",
        entite: "AffectationCohorte",
        details: { cohorteId, etudiantId, anneeScolaireId },
      },
    }),
  ]);

  return { statut: placeDisponible ? "AFFECTE" : "EN_ATTENTE" };
}
