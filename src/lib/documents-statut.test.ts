import { describe, expect, it } from "vitest";
import { statutDocumentsRequis, dossierDocumentaireComplet } from "./documents-statut";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("statutDocumentsRequis", () => {
  it("marque MANQUANT un type de document absent", () => {
    const statut = statutDocumentsRequis([]);
    expect(statut.PIECE_IDENTITE).toBe("MANQUANT");
    expect(statut.PHOTO).toBe("MANQUANT");
    expect(statut.DOSSIER_SIGNE).toBe("MANQUANT");
  });

  it("marque OK un document présent sans date d'expiration (photo, dossier signé)", () => {
    const statut = statutDocumentsRequis([{ type: "PHOTO" }]);
    expect(statut.PHOTO).toBe("OK");
  });

  it("marque OK une pièce d'identité sans date d'expiration renseignée", () => {
    const statut = statutDocumentsRequis([{ type: "PIECE_IDENTITE", dateExpiration: null }]);
    expect(statut.PIECE_IDENTITE).toBe("OK");
  });

  it("marque OK une pièce d'identité dont la date d'expiration est future", () => {
    const statut = statutDocumentsRequis([
      { type: "PIECE_IDENTITE", dateExpiration: d("2099-01-01") },
    ]);
    expect(statut.PIECE_IDENTITE).toBe("OK");
  });

  it("marque EXPIRE une pièce d'identité dont la date d'expiration est passée", () => {
    const statut = statutDocumentsRequis([
      { type: "PIECE_IDENTITE", dateExpiration: d("2000-01-01") },
    ]);
    expect(statut.PIECE_IDENTITE).toBe("EXPIRE");
  });

  it("marque OK dès qu'une des pièces d'identité présentes est valide", () => {
    const statut = statutDocumentsRequis([
      { type: "PIECE_IDENTITE", dateExpiration: d("2000-01-01") },
      { type: "PIECE_IDENTITE", dateExpiration: d("2099-01-01") },
    ]);
    expect(statut.PIECE_IDENTITE).toBe("OK");
  });
});

describe("dossierDocumentaireComplet", () => {
  it("est incomplet si un type requis manque", () => {
    expect(
      dossierDocumentaireComplet([
        { type: "PIECE_IDENTITE", dateExpiration: null },
        { type: "PHOTO" },
      ]),
    ).toBe(false);
  });

  it("est incomplet si la pièce d'identité présente est expirée", () => {
    expect(
      dossierDocumentaireComplet([
        { type: "PIECE_IDENTITE", dateExpiration: d("2000-01-01") },
        { type: "PHOTO" },
        { type: "DOSSIER_SIGNE" },
      ]),
    ).toBe(false);
  });

  it("est complet quand tous les types requis sont présents et valides", () => {
    expect(
      dossierDocumentaireComplet([
        { type: "PIECE_IDENTITE", dateExpiration: d("2099-01-01") },
        { type: "PHOTO" },
        { type: "DOSSIER_SIGNE" },
      ]),
    ).toBe(true);
  });
});
