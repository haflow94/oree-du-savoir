import { prisma } from "@/lib/prisma";

// La Section d'un étudiant n'est pas stockée directement : elle se déduit de
// ses inscriptions actives (Etudiant -> InscriptionClasse -> Classe -> Cours
// -> Section) sur l'année scolaire en cours. Un étudiant peut appartenir à
// plusieurs Sections à la fois (ex. Langue Arabe + Études Coraniques).

export type SectionResume = { id: string; nom: string };

type InscriptionAvecSection = {
  classe: { cours: { section: SectionResume } };
};

export async function anneeScolaireActiveId(): Promise<string | null> {
  const annee = await prisma.anneeScolaire.findFirst({ where: { active: true } });
  return annee?.id ?? null;
}

// Clause `include` prête à l'emploi pour ne récupérer que les inscriptions
// de l'année scolaire active, avec la chaîne jusqu'à la Section.
export function inclureInscriptionsActives(anneeScolaireId: string) {
  return {
    where: { classe: { anneeScolaireId } },
    include: { classe: { include: { cours: { include: { section: true } } } } },
  } as const;
}

export function sectionsDInscriptions(
  inscriptions: InscriptionAvecSection[],
): SectionResume[] {
  const parId = new Map<string, SectionResume>();
  for (const i of inscriptions) {
    const section = i.classe.cours.section;
    parId.set(section.id, { id: section.id, nom: section.nom });
  }
  return [...parId.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

// Clause `where` pour restreindre une requête Etudiant aux étudiants ayant
// une inscription active dans la Section donnée, sur l'année scolaire active.
export function filtreParSection(anneeScolaireId: string, sectionId: string) {
  return {
    inscriptions: {
      some: { classe: { anneeScolaireId, cours: { sectionId } } },
    },
  } as const;
}

// Clause `include` prête à l'emploi pour ne récupérer que le dossier annuel
// de l'année scolaire active (0 ou 1 ligne, contrainte unique etudiant+année),
// avec les échéances/paiements nécessaires au calcul du statut de cotisation
// (voir `statutCotisation` dans src/lib/paiements.ts).
export function inclureDossierAnnuelActif(anneeScolaireId: string) {
  return {
    where: { anneeScolaireId },
    include: {
      echeances: { include: { paiements: { include: { cheque: true, prelevement: true } } } },
    },
  } as const;
}

// Réinscrit pour l'année active = a un DossierAnnuel ET au moins une
// InscriptionClasse sur cette année (les deux volets du dossier annuel).
// À appeler avec des relations déjà filtrées sur l'année active (voir
// `inclureInscriptionsActives` / `inclureDossierAnnuelActif`).
export function estReinscrit(etudiant: {
  inscriptions: unknown[];
  dossiersAnnuels: unknown[];
}): boolean {
  return etudiant.inscriptions.length > 0 && etudiant.dossiersAnnuels.length > 0;
}

// Clause `where` pour restreindre une requête Etudiant au statut de
// réinscription sur l'année active (voir `estReinscrit`).
export function filtreParReinscription(anneeScolaireId: string, reinscrit: boolean) {
  const aDossier = { dossiersAnnuels: { some: { anneeScolaireId } } } as const;
  const aInscription = { inscriptions: { some: { classe: { anneeScolaireId } } } } as const;
  return reinscrit
    ? { AND: [aDossier, aInscription] }
    : { OR: [{ dossiersAnnuels: { none: { anneeScolaireId } } }, { inscriptions: { none: { classe: { anneeScolaireId } } } }] };
}

// Un étudiant est "nouveau" pour une année scolaire donnée s'il n'a jamais eu
// de DossierAnnuel ni d'InscriptionClasse sur une AUTRE année scolaire — sa
// toute première inscription est celle de cette année-là. À distinguer d'un
// "ancien" (déjà inscrit une année précédente) : sert à ne pas afficher
// "Non réinscrit" — qui suppose à tort une inscription passée — pour un
// étudiant qui n'a jamais été inscrit avant lui. À appeler avec l'historique
// complet (toutes années) de l'étudiant.
export function estNouveau(
  etudiant: {
    inscriptions: { classe: { anneeScolaireId: string } }[];
    dossiersAnnuels: { anneeScolaireId: string }[];
  },
  anneeScolaireId: string,
): boolean {
  return (
    etudiant.inscriptions.every((i) => i.classe.anneeScolaireId === anneeScolaireId) &&
    etudiant.dossiersAnnuels.every((d) => d.anneeScolaireId === anneeScolaireId)
  );
}

// Variante par compteurs de `estNouveau`, pour les listes qui ne chargent que
// les inscriptions/dossiers annuels de l'année sélectionnée (voir
// `inclureInscriptionsActives`/`inclureDossierAnnuelActif`) plutôt que tout
// l'historique : compte séparément les enregistrements des AUTRES années via
// `_count` (voir `compterHistoriqueAutreAnnee`).
export function estNouveauParCompteur(etudiant: {
  _count: { inscriptions: number; dossiersAnnuels: number };
}): boolean {
  return etudiant._count.inscriptions === 0 && etudiant._count.dossiersAnnuels === 0;
}

// Clause `_count.select` prête à l'emploi pour `estNouveauParCompteur` :
// compte les inscriptions/dossiers annuels d'un étudiant sur une AUTRE année
// scolaire que celle donnée.
export function compterHistoriqueAutreAnnee(anneeScolaireId: string) {
  return {
    inscriptions: { where: { classe: { anneeScolaireId: { not: anneeScolaireId } } } },
    dossiersAnnuels: { where: { anneeScolaireId: { not: anneeScolaireId } } },
  } as const;
}

// Décomposition d'une suggestion de tarif : formation et frais de dossier
// restent distincts à l'écran (deux postes différents pour le staff / la
// famille) même si `total` est la seule valeur réellement enregistrée sur le
// DossierAnnuel (montantDu).
export type TarifSuggere = { formation: number; dossier: number; total: number };

// Additionne les frais de formation de chaque Section suivie (un poste par
// section, cumulatif), mais les frais de DOSSIER ne se paient qu'une seule
// fois par étudiant quel que soit le nombre de sections suivies (frais
// administratif unique, pas un tarif par cours) — on retient le plus élevé
// des frais de dossier des sections suivies plutôt que de les additionner.
export function cumulerTarif(sections: { fraisFormation: unknown; fraisDossier: unknown }[]): TarifSuggere {
  const formation = sections.reduce(
    (somme, s) => somme + Number.parseFloat(String(s.fraisFormation)),
    0,
  );
  const dossier = sections.reduce(
    (max, s) => Math.max(max, Number.parseFloat(String(s.fraisDossier))),
    0,
  );
  return { formation, dossier, total: formation + dossier };
}

// Suggestion de montant dû pour un DossierAnnuel, décomposée en frais de
// formation + frais de dossier des Sections où l'étudiant suit réellement
// une classe cette année-là (Etudiant -> InscriptionClasse -> Classe ->
// Cours -> Section). Toujours une SUGGESTION éditable, jamais imposée — le
// staff garde la main (fratrie, remise…). Retourne null si l'étudiant n'a
// aucun cours suivi cette année (rien à suggérer).
export async function tarifSuggereDossier(
  etudiantId: string,
  anneeScolaireId: string,
): Promise<TarifSuggere | null> {
  const inscriptions = await prisma.inscriptionClasse.findMany({
    where: { etudiantId, classe: { anneeScolaireId } },
    include: { classe: { include: { cours: { include: { section: true } } } } },
  });
  const sections = sectionsDInscriptions(inscriptions);
  if (sections.length === 0) return null;

  const sectionsCompletes = await prisma.section.findMany({
    where: { id: { in: sections.map((s) => s.id) } },
  });
  return cumulerTarif(sectionsCompletes);
}
