import { afterEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    etudiant: {
      findMany: (...args: unknown[]) => findMany(...args),
      findFirst: (...args: unknown[]) => findFirst(...args),
    },
  },
}));

const { trouverCorrespondancesContact, trouverDoublonEtudiant } = await import(
  "./doublons-etudiant"
);

function candidat(
  overrides: Partial<{
    id: string;
    nom: string;
    prenom: string;
    email: string | null;
    telephoneMobile: string | null;
    telephoneFixe: string | null;
    responsables: { email: string | null; telephone: string | null; telephoneProfessionnel: string | null }[];
  }> = {},
) {
  return {
    id: "et1",
    nom: "Dupont",
    prenom: "Ali",
    email: null,
    telephoneMobile: null,
    telephoneFixe: null,
    responsables: [],
    ...overrides,
  };
}

describe("trouverCorrespondancesContact", () => {
  afterEach(() => vi.clearAllMocks());

  it("aucune correspondance : renvoie une liste vide", async () => {
    findMany.mockResolvedValueOnce([candidat({ email: "autre@example.com" })]);
    const resultats = await trouverCorrespondancesContact({
      emails: ["famille@example.com"],
      telephones: [],
    });
    expect(resultats).toEqual([]);
  });

  it("même e-mail (étudiant) : critère EMAIL", async () => {
    findMany.mockResolvedValueOnce([candidat({ email: "famille@example.com" })]);
    const resultats = await trouverCorrespondancesContact({
      emails: ["famille@example.com"],
      telephones: [],
    });
    expect(resultats).toEqual([{ id: "et1", nom: "Dupont", prenom: "Ali", critere: "EMAIL" }]);
  });

  it("même e-mail, casse et espaces différents : reconnu quand même", async () => {
    findMany.mockResolvedValueOnce([candidat({ email: "Famille@Example.com" })]);
    const resultats = await trouverCorrespondancesContact({
      emails: ["  famille@example.com  "],
      telephones: [],
    });
    expect(resultats).toHaveLength(1);
  });

  it("même e-mail via le responsable légal (dossier Jeunes)", async () => {
    findMany.mockResolvedValueOnce([
      candidat({ email: null, responsables: [{ email: "parent@example.com", telephone: null, telephoneProfessionnel: null }] }),
    ]);
    const resultats = await trouverCorrespondancesContact({
      emails: ["parent@example.com"],
      telephones: [],
    });
    expect(resultats[0].critere).toBe("EMAIL");
  });

  it("même téléphone : critère TELEPHONE", async () => {
    findMany.mockResolvedValueOnce([candidat({ telephoneMobile: "0612345678" })]);
    const resultats = await trouverCorrespondancesContact({
      emails: [],
      telephones: ["0612345678"],
    });
    expect(resultats).toEqual([{ id: "et1", nom: "Dupont", prenom: "Ali", critere: "TELEPHONE" }]);
  });

  it("téléphone avec espaces : reconnu comme le même numéro", async () => {
    findMany.mockResolvedValueOnce([candidat({ telephoneMobile: "0612345678" })]);
    const resultats = await trouverCorrespondancesContact({
      emails: [],
      telephones: ["06 12 34 56 78"],
    });
    expect(resultats).toHaveLength(1);
  });

  it("téléphone avec points : reconnu comme le même numéro", async () => {
    findMany.mockResolvedValueOnce([candidat({ telephoneMobile: "0612345678" })]);
    const resultats = await trouverCorrespondancesContact({
      emails: [],
      telephones: ["06.12.34.56.78"],
    });
    expect(resultats).toHaveLength(1);
  });

  it("téléphone avec tirets : reconnu comme le même numéro", async () => {
    findMany.mockResolvedValueOnce([candidat({ telephoneMobile: "0612345678" })]);
    const resultats = await trouverCorrespondancesContact({
      emails: [],
      telephones: ["06-12-34-56-78"],
    });
    expect(resultats).toHaveLength(1);
  });

  it("téléphone en +33 : reconnu comme le même numéro que sa forme nationale", async () => {
    findMany.mockResolvedValueOnce([candidat({ telephoneMobile: "0612345678" })]);
    const resultats = await trouverCorrespondancesContact({
      emails: [],
      telephones: ["+33 6 12 34 56 78"],
    });
    expect(resultats).toHaveLength(1);

    findMany.mockResolvedValueOnce([candidat({ telephoneMobile: "0612345678" })]);
    const resultats2 = await trouverCorrespondancesContact({
      emails: [],
      telephones: ["+33612345678"],
    });
    expect(resultats2).toHaveLength(1);
  });

  it("même téléphone professionnel du responsable : critère TELEPHONE", async () => {
    findMany.mockResolvedValueOnce([
      candidat({ responsables: [{ email: null, telephone: null, telephoneProfessionnel: "0612345678" }] }),
    ]);
    const resultats = await trouverCorrespondancesContact({
      emails: [],
      telephones: ["0612345678"],
    });
    expect(resultats[0].critere).toBe("TELEPHONE");
  });

  it("même e-mail ET même téléphone sur le même candidat : critère EMAIL_ET_TELEPHONE", async () => {
    findMany.mockResolvedValueOnce([candidat({ email: "famille@example.com", telephoneMobile: "0612345678" })]);
    const resultats = await trouverCorrespondancesContact({
      emails: ["famille@example.com"],
      telephones: ["0612345678"],
    });
    expect(resultats[0].critere).toBe("EMAIL_ET_TELEPHONE");
  });

  it("plusieurs correspondances distinctes : renvoie chaque candidat concerné", async () => {
    findMany.mockResolvedValueOnce([
      candidat({ id: "et1", email: "famille@example.com" }),
      candidat({ id: "et2", telephoneMobile: "0612345678" }),
      candidat({ id: "et3", email: "sans-rapport@example.com" }),
    ]);
    const resultats = await trouverCorrespondancesContact({
      emails: ["famille@example.com"],
      telephones: ["0612345678"],
    });
    expect(resultats.map((r) => r.id).sort()).toEqual(["et1", "et2"]);
  });

  it("fratrie partageant le téléphone/e-mail d'un même responsable : signalée (alerte), jamais bloquante — la fonction ne fait que remonter la correspondance", async () => {
    findMany.mockResolvedValueOnce([
      candidat({
        id: "frere1",
        nom: "Dupont",
        prenom: "Sami",
        responsables: [{ email: "parent@example.com", telephone: "0612345678", telephoneProfessionnel: null }],
      }),
    ]);
    const resultats = await trouverCorrespondancesContact({
      emails: ["parent@example.com"],
      telephones: ["0612345678"],
    });
    // La fonction reste purement informative : elle renvoie la correspondance
    // (à charge du staff de juger qu'il s'agit d'une fratrie), elle ne
    // lève ni erreur ni signal de blocage.
    expect(resultats).toEqual([
      { id: "frere1", nom: "Dupont", prenom: "Sami", critere: "EMAIL_ET_TELEPHONE" },
    ]);
  });

  it("entrées vides des deux côtés : ne va même pas interroger la base", async () => {
    const resultats = await trouverCorrespondancesContact({ emails: [null, undefined], telephones: [] });
    expect(resultats).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("trouverDoublonEtudiant", () => {
  afterEach(() => vi.clearAllMocks());

  it("nom + prénom + date de naissance existant : critère NOM_DATE (comportement préservé)", async () => {
    findFirst.mockResolvedValueOnce({ id: "et1", nom: "Dupont", prenom: "Ali" });
    const resultat = await trouverDoublonEtudiant({
      nom: "Dupont",
      prenom: "Ali",
      dateNaissance: new Date("2012-05-01"),
      emails: [],
      telephones: [],
    });
    expect(resultat).toEqual({ id: "et1", nom: "Dupont", prenom: "Ali", critere: "NOM_DATE" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("pas de correspondance nom+date, mais correspondance e-mail : critère EMAIL, indépendant du nom", async () => {
    findFirst.mockResolvedValueOnce(null);
    findMany.mockResolvedValueOnce([candidat({ id: "et9", nom: "Autrenom", prenom: "Autreprenom", email: "famille@example.com" })]);

    const resultat = await trouverDoublonEtudiant({
      nom: "Dupont",
      prenom: "Ali",
      dateNaissance: new Date("2012-05-01"),
      emails: ["famille@example.com"],
      telephones: [],
    });

    expect(resultat).toEqual({ id: "et9", nom: "Autrenom", prenom: "Autreprenom", critere: "EMAIL" });
  });

  it("aucune correspondance sur aucun des deux axes : null", async () => {
    findFirst.mockResolvedValueOnce(null);
    findMany.mockResolvedValueOnce([]);

    const resultat = await trouverDoublonEtudiant({
      nom: "Dupont",
      prenom: "Ali",
      dateNaissance: new Date("2012-05-01"),
      emails: ["personne@example.com"],
      telephones: [],
    });

    expect(resultat).toBeNull();
  });

  it("sans date de naissance connue : saute directement à la correspondance contact", async () => {
    findMany.mockResolvedValueOnce([candidat({ email: "famille@example.com" })]);

    const resultat = await trouverDoublonEtudiant({
      nom: "Dupont",
      prenom: "Ali",
      dateNaissance: null,
      emails: ["famille@example.com"],
      telephones: [],
    });

    expect(findFirst).not.toHaveBeenCalled();
    expect(resultat?.critere).toBe("EMAIL");
  });
});
