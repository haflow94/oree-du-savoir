import "server-only";
import puppeteer, { type Browser } from "puppeteer-core";

// Instance Chromium partagée entre requêtes (lancer un navigateur coûte
// plusieurs centaines de ms) — même principe de singleton que
// src/lib/prisma.ts pour survivre au hot-reload de Next.js en dev.
const globalForBrowser = globalThis as unknown as {
  dossierBrowser: Promise<Browser> | undefined;
};

function lancerNavigateur(): Promise<Browser> {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!executablePath) {
    throw new Error(
      "PUPPETEER_EXECUTABLE_PATH n'est pas défini (voir .env.example) : nécessaire pour générer les dossiers en PDF.",
    );
  }
  return puppeteer.launch({
    executablePath,
    headless: true,
    // --no-sandbox : requis pour lancer Chromium dans un conteneur Docker
    // (voir Dockerfile) — sans impact de sécurité ici, la page rendue vient
    // uniquement de nos propres templates + données internes, jamais de
    // contenu tiers non maîtrisé.
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

export function getBrowser(): Promise<Browser> {
  if (!globalForBrowser.dossierBrowser) {
    globalForBrowser.dossierBrowser = lancerNavigateur();
  }
  return globalForBrowser.dossierBrowser;
}
