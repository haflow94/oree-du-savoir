// Fonction pure, séparée de context.ts (qui porte `import "server-only"`)
// pour rester testable sans DB — même principe que
// src/lib/documents-statut.ts vis-à-vis de documents.ts.

// La case Père/Mère/Autre est cochée automatiquement selon le lien réel du
// responsable principal (voir context.ts : rl_est_pere/rl_est_mere, et ici
// pour "Autre") ; le texte de la case "Autre" est dérivé du champ libre
// `lien` déjà existant sur ResponsableLegal, sans nouveau champ dédié.
export function relationAutre(lien: string): string {
  const normalise = lien.trim().toLowerCase();
  return normalise === "père" || normalise === "mère" ? "" : lien;
}
