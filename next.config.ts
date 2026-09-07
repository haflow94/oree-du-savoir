import type { NextConfig } from "next";

// Même variable d'environnement et même valeur par défaut que
// TAILLE_MAX_FICHIER_MO (lib/fichiers-uploades.ts, contrôlée explicitement à
// l'upload sur preinscription/actions.ts) : pas réimportée telle quelle ici
// car ce module fait `import "server-only"`, qui échoue hors du bundler
// Next (next.config.ts est chargé directement par Node, avant webpack).
const TAILLE_MAX_FICHIER_MO = Number(process.env.TAILLE_MAX_FICHIER_MO) || 8;

const nextConfig: NextConfig = {
  // On gère nous-mêmes la documentation du projet ; pas de génération
  // automatique de AGENTS.md/CLAUDE.md par Next.js.
  agentRules: false,
  // Limite volontaire : sans ce réglage, le plafond par défaut de Next pour
  // les Server Actions (1 Mo) n'est pas pensé comme une protection
  // volontaire et casserait silencieusement tout upload plus gros (photo de
  // pièce d'identité prise au téléphone, document staff…). S'applique à
  // toutes les Server Actions de l'app, pas seulement à la préinscription —
  // Next ne permet pas de limite par route.
  experimental: {
    serverActions: {
      bodySizeLimit: `${TAILLE_MAX_FICHIER_MO}mb`,
    },
  },
};

export default nextConfig;
