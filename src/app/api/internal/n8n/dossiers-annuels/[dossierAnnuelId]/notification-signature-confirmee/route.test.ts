import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const updateMany = vi.fn();
const count = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dossierAnnuel: {
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
  return new NextRequest(
    "http://localhost/api/internal/n8n/dossiers-annuels/dos1/notification-signature-confirmee",
    { method: "POST", headers },
  );
}

function params(dossierAnnuelId = "dos1") {
  return { params: Promise.resolve({ dossierAnnuelId }) };
}

describe("POST /api/internal/n8n/dossiers-annuels/[dossierAnnuelId]/notification-signature-confirmee", () => {
  const original = process.env.N8N_INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = SECRET;
    updateMany.mockReset();
    count.mockReset();
  });

  afterEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = original;
  });

  it("401 sans token, sans même interroger la base", async () => {
    const reponse = await POST(requete(), params());
    expect(reponse.status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("marque le dossier notifié à son premier appel", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    const reponse = await POST(requete(SECRET), params("dos1"));
    const corps = await reponse.json();

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "dos1", notificationSignatureEnvoyeeLe: null },
      data: {
        notificationSignatureEnvoyeeLe: expect.any(Date),
        notificationSignatureErreurLe: null,
        notificationSignatureErreurMessage: null,
      },
    });
    expect(corps).toEqual({ ok: true, dejaMarque: false });
    expect(count).not.toHaveBeenCalled();
  });

  it("deux appels concurrents sur deux dossiers distincts (même étudiant réinscrit) marquent bien chacun le leur", async () => {
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });

    const [reponseA, reponseB] = await Promise.all([
      POST(requete(SECRET), params("dos1")),
      POST(requete(SECRET), params("dos2")),
    ]);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "dos1", notificationSignatureEnvoyeeLe: null },
      data: {
        notificationSignatureEnvoyeeLe: expect.any(Date),
        notificationSignatureErreurLe: null,
        notificationSignatureErreurMessage: null,
      },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "dos2", notificationSignatureEnvoyeeLe: null },
      data: {
        notificationSignatureEnvoyeeLe: expect.any(Date),
        notificationSignatureErreurLe: null,
        notificationSignatureErreurMessage: null,
      },
    });
    expect((await reponseA.json()).dejaMarque).toBe(false);
    expect((await reponseB.json()).dejaMarque).toBe(false);
  });

  it("un second appel (retry n8n) reste idempotent : pas d'erreur, dejaMarque=true", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    count.mockResolvedValue(1); // le dossier existe toujours, juste déjà marqué

    const reponse = await POST(requete(SECRET), params("dos1"));
    const corps = await reponse.json();

    expect(reponse.status).toBe(200);
    expect(corps).toEqual({ ok: true, dejaMarque: true });
  });

  it("404 si le dossier n'existe pas (id invalide)", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    count.mockResolvedValue(0);

    const reponse = await POST(requete(SECRET), params("inconnu"));

    expect(reponse.status).toBe(404);
  });
});
