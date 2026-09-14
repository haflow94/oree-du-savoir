import { prisma } from "@/lib/prisma";

// Capacité d'un bloc Cohorte pour une année scolaire donnée : dérivée de la
// Salle de ses Classes (Salle.capaciteMax) plutôt que d'un champ propre à la
// Cohorte — la capacité est une contrainte physique de la pièce, pas du
// groupe d'élèves qui l'occupe (voir prisma/schema.prisma#Salle). Les
// Classes d'une même Cohorte pour une même année pointent toutes vers la
// même Salle ou aucune (garanti en application, voir
// classes/nouveau/actions.ts et classes/[id]/actions.ts), donc la première
// salle non-nulle rencontrée fait foi. null = illimité (aucune salle encore
// assignée cette année, ou salle sans capacité renseignée).
export function capaciteDepuisClasses(classes: { salle: { capaciteMax: number | null } | null }[]): number | null {
  return classes.find((c) => c.salle)?.salle?.capaciteMax ?? null;
}

export type ResultatAffectationCohorte =
  | { statut: "COHORTE_INTROUVABLE" }
  | { statut: "DEJA_AFFECTE" }
  | { statut: "AFFECTE" }
  | { statut: "EN_ATTENTE" };

// Affecte un étudiant à une Cohorte pour une année scolaire donnée : respecte
// la capacité (voir capaciteDepuisClasses ci-dessus), met en liste d'attente
// si complet, et
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
  const [cohorte, etudiant] = await Promise.all([
    prisma.cohorte.findUnique({ where: { id: cohorteId } }),
    prisma.etudiant.findUnique({ where: { id: etudiantId }, select: { statutInscription: true } }),
  ]);
  if (!cohorte) return { statut: "COHORTE_INTROUVABLE" };

  const dejaAffecte = await prisma.affectationCohorte.findUnique({
    where: { etudiantId_cohorteId_anneeScolaireId: { etudiantId, cohorteId, anneeScolaireId } },
  });
  if (dejaAffecte) return { statut: "DEJA_AFFECTE" };

  const [classesDuBloc, compteAffectes, compteEnAttente] = await Promise.all([
    prisma.classe.findMany({
      where: { cohorteId, anneeScolaireId },
      select: { id: true, salle: { select: { capaciteMax: true } } },
    }),
    prisma.affectationCohorte.count({
      where: { cohorteId, anneeScolaireId, statut: "AFFECTE" },
    }),
    prisma.affectationCohorte.count({
      where: { cohorteId, anneeScolaireId, statut: "EN_ATTENTE" },
    }),
  ]);
  const capaciteMax = capaciteDepuisClasses(classesDuBloc);
  const placeDisponible = capaciteMax === null || compteAffectes < capaciteMax;
  // Règle "signature ≠ validation finale" (voir CLAUDE.md/analyse de
  // conversation) : un étudiant non validé ne doit jamais devenir membre
  // effectif d'une classe. L'AffectationCohorte (choix de la cohorte,
  // capacité/liste d'attente) peut être enregistrée à tout moment — c'est
  // le fan-out InscriptionClasse qui reste bloqué tant que
  // statutInscription n'est pas VALIDE. Voir synchroniserInscriptionsClasse
  // ci-dessous pour le rattrapage symétrique (validation finale posée APRÈS
  // que la cohorte a déjà été choisie).
  const fanOutAutorise = placeDisponible && etudiant?.statutInscription === "VALIDE";

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
    ...(fanOutAutorise && classesDuBloc.length > 0
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
        details: { cohorteId, etudiantId, anneeScolaireId, fanOutAutorise },
      },
    }),
  ]);

  return { statut: placeDisponible ? "AFFECTE" : "EN_ATTENTE" };
}

// Rattrapage symétrique : à appeler juste après qu'un étudiant bascule
// PREINSCRIT → VALIDE (voir etudiants/[id]/actions.ts#validerInscriptionAction)
// pour les AffectationCohorte déjà à AFFECTE mais dont le fan-out avait été
// bloqué faute de validation (cas B/situation 1 de la règle "validation
// finale et affectation classe sont deux événements indépendants, dans
// n'importe quel ordre"). Idempotent (skipDuplicates) : ne recrée jamais une
// InscriptionClasse déjà existante.
export async function synchroniserInscriptionsClasse(etudiantId: string): Promise<void> {
  const affectations = await prisma.affectationCohorte.findMany({
    where: { etudiantId, statut: "AFFECTE" },
    select: { cohorteId: true, anneeScolaireId: true },
  });
  if (affectations.length === 0) return;

  const classes = await prisma.classe.findMany({
    where: { OR: affectations.map((a) => ({ cohorteId: a.cohorteId, anneeScolaireId: a.anneeScolaireId })) },
    select: { id: true },
  });
  if (classes.length === 0) return;

  await prisma.inscriptionClasse.createMany({
    data: classes.map((c) => ({ etudiantId, classeId: c.id })),
    skipDuplicates: true,
  });
}

export type CapaciteCohorte = { capaciteMax: number | null; salleNom: string | null };

// Version groupée de la résolution de capacité ci-dessus (capaciteDepuisClasses),
// pour les pages qui affichent plusieurs Cohortes à la fois (liste
// Classes/Cohortes, sélecteur de cohorte à l'inscription/au paiement) sans
// une requête par cohorte.
export async function capacitesCohortesPourAnnee(
  cohorteIds: string[],
  anneeScolaireId: string,
): Promise<Map<string, CapaciteCohorte>> {
  if (cohorteIds.length === 0) return new Map();
  const classes = await prisma.classe.findMany({
    where: { cohorteId: { in: cohorteIds }, anneeScolaireId, salleId: { not: null } },
    select: { cohorteId: true, salle: { select: { nom: true, capaciteMax: true } } },
  });
  const map = new Map<string, CapaciteCohorte>();
  for (const c of classes) {
    if (!map.has(c.cohorteId) && c.salle) {
      map.set(c.cohorteId, { capaciteMax: c.salle.capaciteMax, salleNom: c.salle.nom });
    }
  }
  return map;
}

// Dérivée, sans nouveau champ (voir CLAUDE.md — vérifier si le modèle
// existant permet déjà de représenter l'état avant d'en ajouter un) : liste
// des étudiants validés administrativement mais sans aucune classe effective
// pour l'année active — file "Validés sans classe" (voir
// (app)/inscriptions/page.tsx).
export async function etudiantsValidesSansClasse(anneeScolaireId: string) {
  return prisma.etudiant.findMany({
    where: {
      statutInscription: "VALIDE",
      anonymiseLe: null,
      inscriptions: { none: { classe: { anneeScolaireId } } },
    },
    select: { id: true, nom: true, prenom: true, misAJourLe: true },
    orderBy: { misAJourLe: "desc" },
  });
}
