import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const updateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    etudiant: {
      updateMany: (...args: unknown[]) => updateMany(...args),
    },
  },
}));

const { POST } = await import("./route");

const SECRET = "s".repeat(64);

function requete(token: string | undefined, body?: unknown): NextRequest {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  headers.set("content-type", "application/json");
  return new NextRequest(
    "http://localhost/api/internal/n8n/etudiants/et1/notification-bienvenue-echec",
    { method: "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) },
  );
}

function params(etudiantId: string) {
  return { params: Promise.resolve({ etudiantId }) };
}

describe("POST /api/internal/n8n/etudiants/[etudiantId]/notification-bienvenue-echec", () => {
  const original = process.env.N8N_INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = SECRET;
    updateMany.mockReset();
  });

  afterEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = original;
  });

  it("401 sans token, sans même toucher la base", async () => {
    const reponse = await POST(requete(undefined, { message: "SMTP timeout" }), params("et1"));
    expect(reponse.status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("400 si message est absent ou vide", async () => {
    const reponse = await POST(requete(SECRET, { message: "  " }), params("et1"));
    expect(reponse.status).toBe(400);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("enregistre l'échec sans condition sur l'état déjà présent", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const reponse = await POST(requete(SECRET, { message: "550 mailbox unavailable" }), params("et1"));
    const corps = await reponse.json();
    expect(reponse.status).toBe(200);
    expect(corps).toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "et1" },
      data: {
        notificationBienvenueErreurLe: expect.any(Date),
        notificationBienvenueErreurMessage: "550 mailbox unavailable",
      },
    });
  });

  it("404 si l'étudiant n'existe pas", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const reponse = await POST(requete(SECRET, { message: "erreur" }), params("inconnu"));
    expect(reponse.status).toBe(404);
  });
});
