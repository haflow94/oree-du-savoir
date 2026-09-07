import { describe, expect, it } from "vitest";
import { enTetesServiceDocument } from "./service-fichier";

const PDF = Buffer.from("%PDF-1.7\n...");
const FAUX_JPG = Buffer.from("<html><script>alert(1)</script></html>");

describe("enTetesServiceDocument", () => {
  it("sert un PDF réel en inline avec le Content-Type détecté", () => {
    const entetes = enTetesServiceDocument(PDF, "piece.pdf", false);
    expect(entetes["Content-Type"]).toBe("application/pdf");
    expect(entetes["Content-Disposition"]).toMatch(/^inline;/);
  });

  it("force le téléchargement même pour un PDF réel quand demandé explicitement", () => {
    const entetes = enTetesServiceDocument(PDF, "piece.pdf", true);
    expect(entetes["Content-Disposition"]).toMatch(/^attachment;/);
  });

  it("force le téléchargement pour un contenu qui n'est ni PDF ni image, quel que soit le nom déclaré", () => {
    const entetes = enTetesServiceDocument(FAUX_JPG, "photo.jpg", false);
    expect(entetes["Content-Type"]).toBe("application/octet-stream");
    expect(entetes["Content-Disposition"]).toMatch(/^attachment;/);
  });
});
