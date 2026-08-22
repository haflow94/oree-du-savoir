// Séparé de lib/enseignants.ts (qui importe Prisma, donc côté serveur
// uniquement) : ce fichier ne fait que du calcul pur, importable aussi bien
// depuis un composant client (voir classes/nouveau/nouvelle-classe-form.tsx)
// que depuis une page serveur, sans jamais entraîner Prisma dans le bundle
// navigateur.

export type EnseignantAvecSections = {
  id: string;
  prenom: string;
  nom: string;
  sectionIds: string[];
};

// Un enseignant sans historique (nouveau compte, jamais encore affecté à une
// classe) reste proposé pour n'importe quelle section — sinon impossible de
// jamais lui confier une première classe. Un enseignant déjà affecté
// ailleurs n'est proposé que pour les sections où il enseigne déjà.
export function filtrerParSection(
  enseignants: EnseignantAvecSections[],
  sectionId: string | undefined,
): EnseignantAvecSections[] {
  if (!sectionId) return enseignants;
  return enseignants.filter((e) => e.sectionIds.length === 0 || e.sectionIds.includes(sectionId));
}
