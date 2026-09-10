import "server-only";
import path from "node:path";
import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import type { Page } from "puppeteer-core";
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

// Position d'une zone de signature du gabarit, en pourcentage de la page
// (mêmes unités que l'API Documenso — voir lib/documenso.ts) : mesurée dans
// le DOM plutôt que calculée à la main à partir du CSS, pour rester exacte
// même si un gabarit change (marges, longueur du règlement intérieur d'une
// section, etc.) sans qu'il faille penser à mettre à jour des coordonnées
// codées en dur ailleurs.
export type ChampSignatureDossier = {
  pageNumber: number;
  pageX: number;
  pageY: number;
  pageWidth: number;
  pageHeight: number;
};

// Chaque `.page` du gabarit est une page A4 de taille fixe (voir <style> des
// templates : width/height en mm, overflow:hidden, break-after:page), jamais
// reflowée par son contenu — la position d'un marqueur `[data-documenso-
// signature]` par rapport au `.page` qui le contient donne donc directement
// des coordonnées fiables, y compris quand ce contenu varie (adresse sur
// plusieurs lignes, règles propres à la section, etc.).
async function mesurerChampsSignature(page: Page): Promise<ChampSignatureDossier[]> {
  return page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll<HTMLElement>(".page"));
    const marqueurs = Array.from(document.querySelectorAll<HTMLElement>("[data-documenso-signature]"));
    return marqueurs.map((marqueur) => {
      const pageIndex = pages.findIndex((p) => p.contains(marqueur));
      const pageRect = pages[pageIndex].getBoundingClientRect();
      const rect = marqueur.getBoundingClientRect();
      return {
        pageNumber: pageIndex + 1,
        pageX: ((rect.left - pageRect.left) / pageRect.width) * 100,
        pageY: ((rect.top - pageRect.top) / pageRect.height) * 100,
        pageWidth: (rect.width / pageRect.width) * 100,
        pageHeight: (rect.height / pageRect.height) * 100,
      };
    });
  });
}

// Rendu HTML → PDF via Chromium headless (voir browser.ts) : format A4,
// fond imprimé, marges à 0 car chaque page du template porte déjà ses
// propres marges internes (12/15/10 mm, voir SPEC-dossiers.md §2). Mesure au
// passage les zones de signature (voir mesurerChampsSignature ci-dessus) :
// un seul rendu Puppeteer pour les deux besoins plutôt que d'ouvrir la page
// une seconde fois.
export async function rendreDossierPdfEtChampsSignature(
  html: string,
): Promise<{ pdf: Buffer; champsSignature: ChampSignatureDossier[] }> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // "load" suffit : polices en file:// et images en data: URI, aucune
    // requête réseau réelle à attendre (voir context.ts, tout est encodé en
    // base64 dans le contexte avant rendu).
    await page.setContent(html, { waitUntil: "load" });
    const champsSignature = await mesurerChampsSignature(page);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return { pdf: Buffer.from(pdf), champsSignature };
  } finally {
    await page.close();
  }
}

export async function rendreDossierPdf(html: string): Promise<Buffer> {
  return (await rendreDossierPdfEtChampsSignature(html)).pdf;
}
