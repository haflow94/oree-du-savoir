// Fonction pure, séparée de context.ts (qui porte `import "server-only"`)
// pour rester testable sans DB — même principe que
// src/lib/documents-statut.ts vis-à-vis de documents.ts.

// Case Père/Mère/Autre jamais pré-cochée à l'impression (règle graphique de
// SPEC-dossiers.md §2) : seul le texte de la case "Autre" est dérivé du champ
// libre `lien` déjà existant sur ResponsableLegal, sans nouveau champ dédié.
export function relationAutre(lien: string): string {
  const normalise = lien.trim().toLowerCase();
  return normalise === "père" || normalise === "mère" ? "" : lien;
}
