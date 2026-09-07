import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { etudiant: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

const requireModule = vi.fn();
vi.mock("@/lib/permissions", () => ({
  requireModule: (...args: unknown[]) => requireModule(...args),
  Module: { ETUDIANTS: "ETUDIANTS" },
}));

// @/lib/doublons-etudiant n'a plus `import "server-only"` (retiré
// exprès, voir son commentaire de tête) : la vraie implémentation de
// trouverCorrespondancesContact tourne ici, seul Prisma est mocké — test
// plus fidèle au comportement réel combiné des deux axes de détection.
const { rechercherDoublonsAction } = await import("./actions");

function formulaire(champs: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) fd.set(cle, valeur);
  return fd;
}

describe("rechercherDoublonsAction — création manuelle", () => {
  beforeEach(() => {
    requireModule.mockResolvedValue({ id: "staff1", role: "BUREAU" });
  });

  afterEach(() => vi.clearAllMocks());

  it("combine nom+prénom exact et correspondance contact (e-mail/téléphone), sans doublonner un même candidat", async () => {
    findMany
      .mockResolvedValueOnce([{ id: "et1", nom: "Dupont", prenom: "Ali", dateNaissance: null }]) // nom+prénom
      .mockResolvedValueOnce([
        // trouverCorrespondancesContact : ré-interroge tous les étudiants
        { id: "et1", nom: "Dupont", prenom: "Ali", email: "ali@example.com", telephoneMobile: null, telephoneFixe: null, responsables: [] },
        { id: "et2", nom: "Sanstoutlien", prenom: "X", email: null, telephoneMobile: "0612345678", telephoneFixe: null, responsables: [] },
      ]);

    const resultats = await rechercherDoublonsAction(
      formulaire({ nom: "Dupont", prenom: "Ali", email: "ali@example.com", telephoneMobile: "0612345678" }),
    );

    // et1 trouvé par les deux axes : une seule entrée (celle du nom+prénom,
    // sans `critere` — voir Doublon dans actions.ts) ; et2 ajouté séparément
    // avec son critère.
    expect(resultats.map((d) => d.id).sort()).toEqual(["et1", "et2"]);
    expect(resultats.find((d) => d.id === "et1")?.critere).toBeUndefined();
    expect(resultats.find((d) => d.id === "et2")?.critere).toBe("TELEPHONE");
  });

  it("aucune correspondance : liste vide, jamais bloquant", async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const resultats = await rechercherDoublonsAction(
      formulaire({ nom: "Personne", prenom: "Inconnue", email: "x@example.com" }),
    );
    expect(resultats).toEqual([]);
  });

  it("fratrie : même téléphone de responsable sur un candidat au nom différent — remonté comme alerte, jamais un blocage (la fonction ne fait que retourner des candidats)", async () => {
    findMany
      .mockResolvedValueOnce([]) // pas de nom+prénom identique
      .mockResolvedValueOnce([
        {
          id: "frere1",
          nom: "Dupont",
          prenom: "Sami",
          email: null,
          telephoneMobile: null,
          telephoneFixe: null,
          responsables: [{ email: null, telephone: "0612345678", telephoneProfessionnel: null }],
        },
      ]);

    const resultats = await rechercherDoublonsAction(
      formulaire({ nom: "Dupont", prenom: "Ali", responsable1Nom: "Martin", responsable1Prenom: "Karim", responsable1Telephone: "0612345678" }),
    );

    expect(resultats).toEqual([{ id: "frere1", nom: "Dupont", prenom: "Sami", dateNaissance: null, critere: "TELEPHONE" }]);
  });

  it("conserve la limite de 5 résultats sur l'ensemble combiné", async () => {
    const parIdentite = Array.from({ length: 5 }, (_, i) => ({
      id: `nom${i}`,
      nom: "Dupont",
      prenom: "Ali",
      dateNaissance: null,
    }));
    const parContact = [
      { id: "contact1", nom: "X", prenom: "Y", email: "x@example.com", telephoneMobile: null, telephoneFixe: null, responsables: [] },
    ];
    findMany.mockResolvedValueOnce(parIdentite).mockResolvedValueOnce(parContact);

    const resultats = await rechercherDoublonsAction(
      formulaire({ nom: "Dupont", prenom: "Ali", email: "x@example.com" }),
    );

    expect(resultats).toHaveLength(5);
  });

  it("nom ou prénom manquant : retourne une liste vide sans interroger la base", async () => {
    const resultats = await rechercherDoublonsAction(formulaire({ nom: "Dupont" }));
    expect(resultats).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
