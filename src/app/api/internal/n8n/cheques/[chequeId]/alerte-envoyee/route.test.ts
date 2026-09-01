import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const updateMany = vi.fn();
const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    cheque: {
      updateMany: (...args: unknown[]) => updateMany(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
    },
  },
}));

const { POST } = await import("./route");

const SECRET = "s".repeat(64);

function requete(token: string | undefined, body?: unknown): NextRequest {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  headers.set("content-type", "application/json");
  return new NextRequest("http://localhost/api/internal/n8n/cheques/chq1/alerte-envoyee", {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function params(chequeId: string) {
  return { params: Promise.resolve({ chequeId }) };
}

describe("POST /api/internal/n8n/cheques/[chequeId]/alerte-envoyee", () => {
  const original = process.env.N8N_INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = SECRET;
    updateMany.mockReset();
    findUnique.mockReset();
  });

  afterEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = original;
  });

  it("401 sans token, sans même toucher la base", async () => {
    const reponse = await POST(requete(undefined, { numeroAlerte: 1 }), params("chq1"));
    expect(reponse.status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("400 si numeroAlerte est absent ou invalide", async () => {
    const reponse = await POST(requete(SECRET, { numeroAlerte: 0 }), params("chq1"));
    expect(reponse.status).toBe(400);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("marque le chèque à son premier appel (numeroAlerte=1)", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const reponse = await POST(requete(SECRET, { numeroAlerte: 1 }), params("chq1"));
    const corps = await reponse.json();
    expect(reponse.status).toBe(200);
    expect(corps).toEqual({ ok: true, dejaMarque: false });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "chq1", nombreAlertesEnvoyees: 0 },
      data: expect.objectContaining({ nombreAlertesEnvoyees: 1 }),
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("un retry avec le même numeroAlerte reste idempotent : pas d'erreur, dejaMarque=true", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue({ nombreAlertesEnvoyees: 1 });
    const reponse = await POST(requete(SECRET, { numeroAlerte: 1 }), params("chq1"));
    const corps = await reponse.json();
    expect(reponse.status).toBe(200);
    expect(corps).toEqual({ ok: true, dejaMarque: true, nombreAlertesEnvoyees: 1 });
  });

  it("404 si le chèque n'existe pas du tout", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue(null);
    const reponse = await POST(requete(SECRET, { numeroAlerte: 1 }), params("inconnu"));
    expect(reponse.status).toBe(404);
  });
});
