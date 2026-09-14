import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { dossierAnnuel: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

const { GET } = await import("./route");

const SECRET = "s".repeat(64);

function requete(token?: string): NextRequest {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/internal/n8n/dossiers-signes-a-notifier", { headers });
}

function dossier(overrides: Record<string, unknown> = {}) {
  return {
    id: "dos1",
    etudiant: {
      id: "et1",
      nom: "Dupont",
      prenom: "Léo",
      email: "leo@example.com",
      responsables: [],
    },
    documents: [{ id: "doc1", nomFichier: "dossier-signe-dupont-leo.pdf" }],
    ...overrides,
  };
}

describe("GET /api/internal/n8n/dossiers-signes-a-notifier", () => {
  const original = process.env.N8N_INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = SECRET;
    findMany.mockReset();
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
    const reponse = await GET(requete("mauvais-token-de-la-bonne-longueur-quand-meme-en-plus-long"));
    expect(reponse.status).toBe(401);
  });

  it("ne sélectionne que les dossiers SIGNEE pas encore signalés, pour des étudiants non anonymisés", async () => {
    findMany.mockResolvedValue([]);
    await GET(requete(SECRET));
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          statutSignature: "SIGNEE",
          notificationSignatureEnvoyeeLe: null,
          etudiant: { anonymiseLe: null },
        },
      }),
    );
  });

  it("remonte le dossier signé avec le document PDF signé correspondant", async () => {
    findMany.mockResolvedValue([dossier()]);

    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();

    expect(corps.candidats).toHaveLength(1);
    expect(corps.candidats[0]).toMatchObject({
      dossierAnnuelId: "dos1",
      etudiantId: "et1",
      nom: "Dupont",
      prenom: "Léo",
      destinataireEmail: "leo@example.com",
      destinatairePrenom: "Léo",
      documentId: "doc1",
      nomFichier: "dossier-signe-dupont-leo.pdf",
    });
  });

  it("utilise l'email et le prénom du responsable pour un dossier Jeunes (étudiant sans email propre)", async () => {
    findMany.mockResolvedValue([
      dossier({
        etudiant: {
          id: "et2",
          nom: "Martin",
          prenom: "Léa",
          email: null,
          responsables: [{ prenom: "Fatima", email: "fatima@example.com" }],
        },
      }),
    ]);

    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();

    expect(corps.candidats[0]).toMatchObject({
      destinataireEmail: "fatima@example.com",
      destinatairePrenom: "Fatima",
    });
  });

  it("saute un dossier sans email exploitable — reste candidat pour un appel ultérieur", async () => {
    findMany.mockResolvedValue([
      dossier({ etudiant: { id: "et3", nom: "Sans", prenom: "Email", email: null, responsables: [] } }),
    ]);

    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();

    expect(corps.candidats).toHaveLength(0);
  });

  it("saute un dossier SIGNEE sans PDF signé encore retrouvé (webhook pas encore fini) — reste candidat", async () => {
    findMany.mockResolvedValue([dossier({ documents: [] })]);

    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();

    expect(corps.candidats).toHaveLength(0);
  });
});
