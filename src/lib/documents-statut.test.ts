import { describe, expect, it } from "vitest";
import { statutDocumentsRequis, dossierDocumentaireComplet, statutDossierAffiche } from "./documents-statut";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("statutDocumentsRequis", () => {
  it("marque MANQUANT un type de document absent", () => {
    const statut = statutDocumentsRequis([]);
    expect(statut.DOSSIER_SIGNE).toBe("MANQUANT");
  });

  it("marque OK un document présent sans date d'expiration", () => {
    const statut = statutDocumentsRequis([{ type: "DOSSIER_SIGNE" }]);
    expect(statut.DOSSIER_SIGNE).toBe("OK");
  });

  it("marque EXPIRE un document requis dont la date d'expiration est passée (mécanisme générique)", () => {
    const statut = statutDocumentsRequis([
      { type: "DOSSIER_SIGNE", dateExpiration: d("2000-01-01") },
    ]);
    expect(statut.DOSSIER_SIGNE).toBe("EXPIRE");
  });

  it("marque OK dès qu'un des documents présents du type requis est valide", () => {
    const statut = statutDocumentsRequis([
      { type: "DOSSIER_SIGNE", dateExpiration: d("2000-01-01") },
      { type: "DOSSIER_SIGNE", dateExpiration: d("2099-01-01") },
    ]);
    expect(statut.DOSSIER_SIGNE).toBe("OK");
  });

  it("ignore les documents PIECE_IDENTITE/PHOTO : ils ne sont plus une condition de validation", () => {
    const statut = statutDocumentsRequis([
      { type: "PIECE_IDENTITE", dateExpiration: d("2000-01-01") },
    ]);
    expect(statut.DOSSIER_SIGNE).toBe("MANQUANT");
    expect(Object.keys(statut)).toEqual(["DOSSIER_SIGNE"]);
  });
});

describe("dossierDocumentaireComplet", () => {
  it("est incomplet si le dossier signé manque", () => {
    expect(dossierDocumentaireComplet([{ type: "PIECE_IDENTITE" }, { type: "PHOTO" }])).toBe(false);
  });

  it("est complet dès que le dossier signé est présent, même sans pièce d'identité ni photo", () => {
    expect(dossierDocumentaireComplet([{ type: "DOSSIER_SIGNE" }])).toBe(true);
  });
});

const dossierComplet = [{ type: "DOSSIER_SIGNE" }];

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

  it("SIGNEE avec une pièce d'identité ou une photo absentes reste 'Dossier signé' (plus des conditions)", () => {
    expect(
      statutDossierAffiche({
        statutInscription: "PREINSCRIT",
        statutSignature: "SIGNEE",
        documents: [{ type: "DOSSIER_SIGNE" }],
      }),
    ).toBe("DOSSIER_SIGNE");
  });
});
