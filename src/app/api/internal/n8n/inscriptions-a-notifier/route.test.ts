import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { etudiant: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

const { GET } = await import("./route");

const SECRET = "s".repeat(64);

function requete(token?: string): NextRequest {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/internal/n8n/inscriptions-a-notifier", {
    headers,
  });
}

describe("GET /api/internal/n8n/inscriptions-a-notifier", () => {
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
    const reponse = await GET(requete("mauvais-token"));
    expect(reponse.status).toBe(401);
  });

  it("privilégie l'email du responsable sur celui de l'étudiant", async () => {
    findMany.mockResolvedValue([
      {
        id: "et1",
        nom: "Dupont",
        prenom: "Léo",
        email: "leo@example.com",
        documents: [{ id: "doc1", nomFichier: "dossier-leo.pdf" }],
        responsables: [{ email: "parent@example.com", prenom: "Karim" }],
      },
    ]);

    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();

    expect(reponse.status).toBe(200);
    expect(corps.candidats).toEqual([
      {
        etudiantId: "et1",
        nom: "Dupont",
        prenom: "Léo",
        destinataireEmail: "parent@example.com",
        destinatairePrenom: "Karim",
        documentId: "doc1",
        nomFichier: "dossier-leo.pdf",
      },
    ]);
  });

  it("se rabat sur l'email de l'étudiant quand aucun responsable n'a d'email", async () => {
    findMany.mockResolvedValue([
      {
        id: "et2",
        nom: "Martin",
        prenom: "Sofia",
        email: "sofia@example.com",
        documents: [{ id: "doc2", nomFichier: "dossier-sofia.pdf" }],
        responsables: [],
      },
    ]);

    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();

    expect(corps.candidats[0].destinataireEmail).toBe("sofia@example.com");
    expect(corps.candidats[0].destinatairePrenom).toBe("Sofia");
  });

  it("exclut un candidat sans dossier généré ou sans email exploitable", async () => {
    findMany.mockResolvedValue([
      {
        id: "et3",
        nom: "SansDossier",
        prenom: "X",
        email: "x@example.com",
        documents: [],
        responsables: [],
      },
      {
        id: "et4",
        nom: "SansEmail",
        prenom: "Y",
        email: null,
        documents: [{ id: "doc4", nomFichier: "dossier.pdf" }],
        responsables: [],
      },
    ]);

    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps.candidats).toEqual([]);
  });
});
