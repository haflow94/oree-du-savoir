import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Aligne la résolution de l'alias `@/` sur celle de tsconfig.json, sinon les
// modules importés via cet alias ne sont pas résolus dans les tests.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    // La condition d'export "react-server" (voir node_modules/server-only/
    // package.json) fait résoudre `import "server-only"` vers son propre
    // empty.js plutôt que de lever — c'est le mécanisme officiel du package
    // pour un outil qui charge légitimement du code server-only hors du
    // bundler Next.js (ex. un test qui exerce pour de vrai
    // lib/dossier/render.ts, voir render.test.ts) ; Next.js pose cette même
    // condition côté serveur via webpack, on la déclare ici pour Vitest/Vite.
    // Les tests s'exécutant côté SSR (Node), c'est `ssr.resolve.conditions`
    // ci-dessous qui s'applique réellement — `resolve.conditions` seul (build
    // client) ne suffit pas, mais les deux sont posés par cohérence.
    conditions: ["react-server"],
  },
  ssr: {
    resolve: {
      conditions: ["react-server"],
    },
  },
});
