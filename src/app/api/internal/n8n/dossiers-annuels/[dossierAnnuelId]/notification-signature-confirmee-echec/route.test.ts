import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const updateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dossierAnnuel: {
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
    "http://localhost/api/internal/n8n/dossiers-annuels/dos1/notification-signature-confirmee-echec",
    { method: "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) },
  );
}

function params(dossierAnnuelId: string) {
  return { params: Promise.resolve({ dossierAnnuelId }) };
}

describe("POST /api/internal/n8n/dossiers-annuels/[dossierAnnuelId]/notification-signature-confirmee-echec", () => {
  const original = process.env.N8N_INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = SECRET;
    updateMany.mockReset();
  });

  afterEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = original;
  });

  it("401 sans token, sans même toucher la base", async () => {
    const reponse = await POST(requete(undefined, { message: "erreur" }), params("dos1"));
    expect(reponse.status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("400 si message est absent ou vide", async () => {
    const reponse = await POST(requete(SECRET, {}), params("dos1"));
    expect(reponse.status).toBe(400);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("enregistre l'échec", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const reponse = await POST(requete(SECRET, { message: "550 mailbox unavailable" }), params("dos1"));
    const corps = await reponse.json();
    expect(reponse.status).toBe(200);
    expect(corps).toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "dos1" },
      data: {
        notificationSignatureErreurLe: expect.any(Date),
        notificationSignatureErreurMessage: "550 mailbox unavailable",
      },
    });
  });

  it("404 si le dossier n'existe pas", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const reponse = await POST(requete(SECRET, { message: "erreur" }), params("inconnu"));
    expect(reponse.status).toBe(404);
  });
});
