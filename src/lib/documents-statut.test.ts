import { describe, expect, it } from "vitest";
import { statutDocumentsRequis, dossierDocumentaireComplet, statutDossierAffiche } from "./documents-statut";

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

const dossierComplet = [
  { type: "PIECE_IDENTITE", dateExpiration: d("2099-01-01") },
  { type: "PHOTO" },
  { type: "DOSSIER_SIGNE" },
];

describe("statutDossierAffiche", () => {
  it("VALIDE l'emporte toujours, même sans DossierAnnuel", () => {
    expect(
      statutDossierAffiche({ statutInscription: "VALIDE", statutSignature: null, documents: [] }),
    ).toBe("VALIDE_DEFINITIVEMENT");
  });

  it("VALIDE l'emporte même si le dossier de signature n'est pas terminé", () => {
    expect(
      statutDossierAffiche({
        statutInscription: "VALIDE",
        statutSignature: "A_GENERER",
        documents: [],
      }),
    ).toBe("VALIDE_DEFINITIVEMENT");
  });

  it("renvoie null (aucun statut) quand il n'existe aucun DossierAnnuel", () => {
    expect(
      statutDossierAffiche({
        statutInscription: "PREINSCRIT",
        statutSignature: null,
        documents: [],
      }),
    ).toBeNull();
  });

  it("A_GENERER -> 'Reçue / en cours'", () => {
    expect(
      statutDossierAffiche({
        statutInscription: "PREINSCRIT",
        statutSignature: "A_GENERER",
        documents: [],
      }),
    ).toBe("RECUE_EN_COURS");
  });

  it("A_VERIFIER -> 'À vérifier'", () => {
    expect(
      statutDossierAffiche({
        statutInscription: "PREINSCRIT",
        statutSignature: "A_VERIFIER",
        documents: [],
      }),
    ).toBe("A_VERIFIER");
  });

  it("ENVOYEE_SIGNATURE -> 'Envoyé en signature'", () => {
    expect(
      statutDossierAffiche({
        statutInscription: "PREINSCRIT",
        statutSignature: "ENVOYEE_SIGNATURE",
        documents: [],
      }),
    ).toBe("ENVOYE_SIGNATURE");
  });

  it("SIGNEE + dossier documentaire complet -> 'Dossier signé'", () => {
    expect(
      statutDossierAffiche({
        statutInscription: "PREINSCRIT",
        statutSignature: "SIGNEE",
        documents: dossierComplet,
      }),
    ).toBe("DOSSIER_SIGNE");
  });

  it("SIGNEE mais dossier documentaire incomplet -> 'À compléter'", () => {
    expect(
      statutDossierAffiche({
        statutInscription: "PREINSCRIT",
        statutSignature: "SIGNEE",
        documents: [],
      }),
    ).toBe("A_COMPLETER");
  });

  it("SIGNEE avec une pièce d'identité expirée reste 'À compléter'", () => {
    expect(
      statutDossierAffiche({
        statutInscription: "PREINSCRIT",
        statutSignature: "SIGNEE",
        documents: [
          { type: "PIECE_IDENTITE", dateExpiration: d("2000-01-01") },
          { type: "PHOTO" },
          { type: "DOSSIER_SIGNE" },
        ],
      }),
    ).toBe("A_COMPLETER");
  });
});
