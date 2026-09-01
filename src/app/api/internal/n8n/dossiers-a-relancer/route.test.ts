import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const parametresRelanceFindFirst = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    parametresRelance: { findFirst: (...args: unknown[]) => parametresRelanceFindFirst(...args) },
    dossierAnnuel: { findMany: (...args: unknown[]) => findMany(...args) },
  },
}));

const { GET } = await import("./route");

const SECRET = "s".repeat(64);
const JOUR = 24 * 60 * 60 * 1000;

function requete(token?: string): NextRequest {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/internal/n8n/dossiers-a-relancer", { headers });
}

function dossier(overrides: Record<string, unknown> = {}) {
  return {
    id: "dos1",
    creeLe: new Date(Date.now() - 30 * JOUR),
    derniereRelanceEnvoyeeLe: null,
    nombreRelancesEnvoyees: 0,
    echeances: [{ paiements: [] }],
    etudiant: {
      id: "et1",
      nom: "Dupont",
      prenom: "Léo",
      email: "leo@example.com",
      documents: [{ id: "doc1" }],
      responsables: [],
    },
    ...overrides,
  };
}

describe("GET /api/internal/n8n/dossiers-a-relancer", () => {
  const original = process.env.N8N_INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = SECRET;
    parametresRelanceFindFirst.mockReset();
    findMany.mockReset();
    parametresRelanceFindFirst.mockResolvedValue({ nombreMaxRelances: 1, delaiJours: 15 });
  });

  afterEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = original;
  });

  it("401 sans token, sans même interroger la base", async () => {
    const reponse = await GET(requete());
    expect(reponse.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("401 avec un mauvais token", async () => {
    const reponse = await GET(requete("mauvais-token"));
    expect(reponse.status).toBe(401);
  });

  it("liste vide si aucun ParametresRelance en base", async () => {
    parametresRelanceFindFirst.mockResolvedValue(null);
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps.candidats).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("relance un dossier sans aucun paiement, passé le délai", async () => {
    findMany.mockResolvedValue([dossier()]);
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(reponse.status).toBe(200);
    expect(corps.candidats).toEqual([
      {
        dossierAnnuelId: "dos1",
        etudiantId: "et1",
        nom: "Dupont",
        prenom: "Léo",
        destinataireEmail: "leo@example.com",
        destinatairePrenom: "Léo",
        numeroRelance: 1,
        motifs: ["PAIEMENT"],
      },
    ]);
  });

  it("privilégie l'email et le prénom du responsable", async () => {
    findMany.mockResolvedValue([
      dossier({
        etudiant: {
          id: "et1",
          nom: "Dupont",
          prenom: "Léo",
          email: "leo@example.com",
          documents: [],
          responsables: [{ email: "parent@example.com", prenom: "Karim" }],
        },
      }),
    ]);
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps.candidats[0].destinataireEmail).toBe("parent@example.com");
    expect(corps.candidats[0].destinatairePrenom).toBe("Karim");
  });

  it("n'exclut pas un dossier qui a un paiement mais dont la pièce d'identité manque", async () => {
    findMany.mockResolvedValue([
      dossier({
        echeances: [{ paiements: [{ id: "p1" }] }],
        etudiant: {
          id: "et1",
          nom: "Dupont",
          prenom: "Léo",
          email: "leo@example.com",
          documents: [],
          responsables: [],
        },
      }),
    ]);
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps.candidats[0].motifs).toEqual(["PIECE_IDENTITE"]);
  });

  it("exclut un dossier qui a au moins un paiement et sa pièce d'identité", async () => {
    findMany.mockResolvedValue([
      dossier({
        echeances: [{ paiements: [{ id: "p1" }] }],
        etudiant: {
          id: "et1",
          nom: "Dupont",
          prenom: "Léo",
          email: "leo@example.com",
          documents: [{ id: "doc1" }],
          responsables: [],
        },
      }),
    ]);
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps.candidats).toEqual([]);
  });

  it("exclut un dossier pas encore assez ancien (délai non atteint)", async () => {
    findMany.mockResolvedValue([dossier({ creeLe: new Date(Date.now() - 5 * JOUR) })]);
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps.candidats).toEqual([]);
  });

  it("ancre le délai sur la dernière relance plutôt que la création si elle existe", async () => {
    findMany.mockResolvedValue([
      dossier({
        creeLe: new Date(Date.now() - 100 * JOUR),
        derniereRelanceEnvoyeeLe: new Date(Date.now() - 5 * JOUR),
        nombreRelancesEnvoyees: 1,
      }),
    ]);
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps.candidats).toEqual([]);
  });

  it("exclut un candidat sans email exploitable", async () => {
    findMany.mockResolvedValue([
      dossier({
        etudiant: {
          id: "et1",
          nom: "Dupont",
          prenom: "Léo",
          email: null,
          documents: [],
          responsables: [],
        },
      }),
    ]);
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps.candidats).toEqual([]);
  });

  it("propage le bon numéro de relance à envoyer", async () => {
    findMany.mockResolvedValue([dossier({ nombreRelancesEnvoyees: 1 })]);
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps.candidats[0].numeroRelance).toBe(2);
  });
});
