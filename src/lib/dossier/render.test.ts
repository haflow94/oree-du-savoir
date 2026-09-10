import { describe, expect, it } from "vitest";
import { rendreDossierHtml, rendreDossierPdfEtChampsSignature } from "./render";

// Test RÉEL (aucun mock) : exerce le vrai Chromium headless pour confirmer
// que le rendu mesure bien les 2 zones de signature attendues (voir
// NB_ZONES_SIGNATURE_ATTENDUES, lib/dossier/generation.ts) — c'est
// précisément ce mécanisme que generation.test.ts couvre par ailleurs en le
// mockant (les 3 scénarios de désambiguïsation) ; celui-ci vérifie qu'il
// fonctionne réellement contre le vrai gabarit.
//
// Nécessite Chromium (PUPPETEER_EXECUTABLE_PATH, voir lib/dossier/browser.ts)
// — absent d'un environnement de test standard sans l'image Docker du
// projet : le test est alors sauté plutôt que faussement rouge, pour ne pas
// casser `npm run test` ailleurs. Lancer par ex. dans le conteneur `app`
// (qui l'a déjà, voir Dockerfile) pour l'exécuter pour de vrai.
describe.skipIf(!process.env.PUPPETEER_EXECUTABLE_PATH)("rendreDossierPdfEtChampsSignature (réel, Chromium)", () => {
  // Contexte minimal : les 2 marqueurs data-documenso-signature du gabarit
  // ADULTES ne sont conditionnés par aucun champ (voir
  // templates/adultes.hbs) — un contexte vide suffit donc à les faire
  // apparaître, sans dépendre de la base (Section/Organisation/étudiant).
  it("mesure les 2 zones de signature attendues sur un rendu réel du gabarit ADULTES", async () => {
    const html = await rendreDossierHtml("ADULTES", {});
    const { pdf, champsSignature } = await rendreDossierPdfEtChampsSignature(html);

    expect(pdf.length).toBeGreaterThan(0);
    expect(champsSignature).toHaveLength(2);
    for (const zone of champsSignature) {
      expect(zone.pageNumber).toBeGreaterThan(0);
      expect(zone.pageWidth).toBeGreaterThan(0);
      expect(zone.pageHeight).toBeGreaterThan(0);
    }
  });

  it("mesure aussi les 2 zones attendues sur le gabarit JEUNES", async () => {
    const html = await rendreDossierHtml("JEUNES", {});
    const { champsSignature } = await rendreDossierPdfEtChampsSignature(html);

    expect(champsSignature).toHaveLength(2);
  });
});
