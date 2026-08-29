import "server-only";
import path from "node:path";
import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { getBrowser } from "./browser";
import type { ModeleDossier } from "@/generated/prisma/enums";

const TEMPLATES_DIR = path.join(process.cwd(), "src/lib/dossier/templates");
const FONTS_DIR = path.join(process.cwd(), "public/fonts");

function nomFichierTemplate(modeleDossier: ModeleDossier): string {
  return modeleDossier === "JEUNES" ? "jeunes.hbs" : "adultes.hbs";
}

// Un seul gabarit par modèle (voir SPEC-dossiers.md §4) : jamais dupliqué
// par section. Relu à chaque appel plutôt que mis en cache — fichier de
// quelques Ko, generation peu fréquente, et évite un template obsolète en
// dev après une modification.
export async function rendreDossierHtml(
  modeleDossier: ModeleDossier,
  contexte: Record<string, unknown>,
): Promise<string> {
  const source = await readFile(path.join(TEMPLATES_DIR, nomFichierTemplate(modeleDossier)), "utf8");
  const template = Handlebars.compile(source, { noEscape: false });
  return template({ ...contexte, fontsDir: FONTS_DIR });
}

// Rendu HTML → PDF via Chromium headless (voir browser.ts) : format A4,
// fond imprimé, marges à 0 car chaque page du template porte déjà ses
// propres marges internes (12/15/10 mm, voir SPEC-dossiers.md §2).
export async function rendreDossierPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // "load" suffit : polices en file:// et images en data: URI, aucune
    // requête réseau réelle à attendre (voir context.ts, tout est encodé en
    // base64 dans le contexte avant rendu).
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
