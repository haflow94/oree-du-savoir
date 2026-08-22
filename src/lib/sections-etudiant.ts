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
// de l'année scolaire active (0 ou 1 ligne, contrainte unique etudiant+année).
export function inclureDossierAnnuelActif(anneeScolaireId: string) {
  return { where: { anneeScolaireId } } as const;
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
