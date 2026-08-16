import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Aligne la résolution de l'alias `@/` sur celle de tsconfig.json, sinon les
// modules importés via cet alias ne sont pas résolus dans les tests.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
