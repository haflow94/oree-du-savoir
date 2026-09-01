import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const updateMany = vi.fn();
const count = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    etudiant: {
      updateMany: (...args: unknown[]) => updateMany(...args),
      count: (...args: unknown[]) => count(...args),
    },
  },
}));

const { POST } = await import("./route");

const SECRET = "s".repeat(64);

function requete(token?: string): NextRequest {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/internal/n8n/etudiants/et1/notification-bienvenue", {
    method: "POST",
    headers,
  });
}

function params(etudiantId: string) {
  return { params: Promise.resolve({ etudiantId }) };
}

describe("POST /api/internal/n8n/etudiants/[etudiantId]/notification-bienvenue", () => {
  const original = process.env.N8N_INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = SECRET;
    updateMany.mockReset();
    count.mockReset();
  });

  afterEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = original;
  });

  it("401 sans token, sans même toucher la base", async () => {
    const reponse = await POST(requete(), params("et1"));
    expect(reponse.status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("marque l'étudiant à son premier appel", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const reponse = await POST(requete(SECRET), params("et1"));
    const corps = await reponse.json();
    expect(reponse.status).toBe(200);
    expect(corps).toEqual({ ok: true, dejaMarque: false });
    expect(count).not.toHaveBeenCalled();
  });

  it("un second appel (retry) reste idempotent : pas d'erreur, dejaMarque=true", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    count.mockResolvedValue(1); // l'étudiant existe toujours, juste déjà marqué
    const reponse = await POST(requete(SECRET), params("et1"));
    const corps = await reponse.json();
    expect(reponse.status).toBe(200);
    expect(corps).toEqual({ ok: true, dejaMarque: true });
  });

  it("404 si l'étudiant n'existe pas du tout", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    count.mockResolvedValue(0);
    const reponse = await POST(requete(SECRET), params("inconnu"));
    expect(reponse.status).toBe(404);
  });
});
