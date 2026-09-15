// Mini-courbe de tendance, en SVG pur (pas de librairie de graphes : le
// projet n'en a pas besoin ailleurs, voir CLAUDE.md — "pas de
// sur-ingénierie"). `stroke="currentColor"` : la couleur vient du texte du
// wrapper (voir ACCENT_TEXT dans (app)/page.tsx), pas d'une palette propre à
// ce composant.
const HAUTEUR = 28;
const LARGEUR = 100;

export function Sparkline({ values }: { values: number[] }) {
  // Rien à tracer de significatif avec 0 ou 1 point.
  if (values.length < 2) return null;

  // Les séries groupées ici (compte/montant par jour) sont toujours >= 0 :
  // la ligne de base à 0 est donc toujours en bas du graphique, jamais
  // recalculée depuis le minimum réel de la série.
  const max = Math.max(...values, 0) || 1;
  const points = values
    .map((valeur, i) => {
      const x = (i / (values.length - 1)) * LARGEUR;
      const y = HAUTEUR - (valeur / max) * HAUTEUR;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const dernierY = HAUTEUR - (values[values.length - 1] / max) * HAUTEUR;

  return (
    <svg
      viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
      preserveAspectRatio="none"
      className="h-7 w-full overflow-visible"
      aria-hidden
    >
      <polyline
        points={points}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={1}
        opacity={0.7}
        className="animate-draw-line motion-reduce:animate-none"
      />
      <circle cx={LARGEUR} cy={dernierY} r={2.5} fill="currentColor" />
    </svg>
  );
}
