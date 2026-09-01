import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const lireDocument = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { document: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));
vi.mock("@/lib/documents", () => ({
  lireDocument: (...args: unknown[]) => lireDocument(...args),
}));

const { GET } = await import("./route");

const SECRET = "s".repeat(64);

function requete(token?: string): NextRequest {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/internal/n8n/documents/doc1/fichier", { headers });
}

function params(documentId: string) {
  return { params: Promise.resolve({ documentId }) };
}

describe("GET /api/internal/n8n/documents/[documentId]/fichier", () => {
  const original = process.env.N8N_INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = SECRET;
    findUnique.mockReset();
    lireDocument.mockReset();
  });

  afterEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = original;
  });

  it("401 sans token, sans même interroger la base", async () => {
    const reponse = await GET(requete(), params("doc1"));
    expect(reponse.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("404 si le document n'existe pas", async () => {
    findUnique.mockResolvedValue(null);
    const reponse = await GET(requete(SECRET), params("inconnu"));
    expect(reponse.status).toBe(404);
  });

  it("404 si le document n'est pas un DOSSIER_GENERE, même avec un id valide", async () => {
    findUnique.mockResolvedValue({
      id: "doc1",
      type: "PIECE_IDENTITE",
      cheminRelatif: "etudiants/et1/x.pdf",
      mimeType: "application/pdf",
      nomFichier: "piece.pdf",
    });
    const reponse = await GET(requete(SECRET), params("doc1"));
    expect(reponse.status).toBe(404);
    expect(lireDocument).not.toHaveBeenCalled();
  });

  it("404 si le fichier référencé n'existe plus sur le volume", async () => {
    findUnique.mockResolvedValue({
      id: "doc1",
      type: "DOSSIER_GENERE",
      cheminRelatif: "etudiants/et1/x.pdf",
      mimeType: "application/pdf",
      nomFichier: "dossier.pdf",
    });
    lireDocument.mockRejectedValue(new Error("ENOENT"));
    const reponse = await GET(requete(SECRET), params("doc1"));
    expect(reponse.status).toBe(404);
  });

  it("200 avec le contenu et les en-têtes attendus pour un DOSSIER_GENERE", async () => {
    findUnique.mockResolvedValue({
      id: "doc1",
      type: "DOSSIER_GENERE",
      cheminRelatif: "etudiants/et1/x.pdf",
      mimeType: "application/pdf",
      nomFichier: "dossier-leo.pdf",
    });
    lireDocument.mockResolvedValue(Buffer.from("contenu-pdf"));

    const reponse = await GET(requete(SECRET), params("doc1"));
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("content-type")).toBe("application/pdf");
    expect(reponse.headers.get("content-disposition")).toContain("dossier-leo.pdf");
    expect(await reponse.text()).toBe("contenu-pdf");
  });
});
