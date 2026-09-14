import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const findFirst = vi.fn();
const updateMany = vi.fn();
const count = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dossierAnnuel: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
    },
    etudiant: {
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
    "http://localhost/api/internal/n8n/etudiants/et1/notification-signature-confirmee",
    { method: "POST", headers },
  );
}

function params(etudiantId = "et1") {
  return { params: Promise.resolve({ etudiantId }) };
}

describe("POST /api/internal/n8n/etudiants/[etudiantId]/notification-signature-confirmee", () => {
  const original = process.env.N8N_INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = SECRET;
    findFirst.mockReset();
    updateMany.mockReset();
    count.mockReset();
  });

  afterEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = original;
  });

  it("401 sans token, sans même interroger la base", async () => {
    const reponse = await POST(requete(), params());
    expect(reponse.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("marque le dossier signé le plus ancien non notifié, à son premier appel", async () => {
    findFirst.mockResolvedValue({ id: "dos1" });
    updateMany.mockResolvedValue({ count: 1 });

    const reponse = await POST(requete(SECRET), params("et1"));
    const corps = await reponse.json();

    expect(findFirst).toHaveBeenCalledWith({
      where: { etudiantId: "et1", statutSignature: "SIGNEE", notificationSignatureEnvoyeeLe: null },
      orderBy: { signeLe: "asc" },
      select: { id: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "dos1", notificationSignatureEnvoyeeLe: null },
      data: { notificationSignatureEnvoyeeLe: expect.any(Date) },
    });
    expect(corps).toEqual({ ok: true, dejaMarque: false });
    expect(count).not.toHaveBeenCalled();
  });

  it("un second appel (retry n8n) reste idempotent : pas d'erreur, dejaMarque=true", async () => {
    findFirst.mockResolvedValue(null);
    count.mockResolvedValue(1); // l'étudiant existe toujours, tous ses dossiers signés sont déjà notifiés

    const reponse = await POST(requete(SECRET), params("et1"));
    const corps = await reponse.json();

    expect(reponse.status).toBe(200);
    expect(corps).toEqual({ ok: true, dejaMarque: true });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("ne marque qu'un seul dossier par appel quand deux dossiers SIGNEE non notifiés existent pour le même étudiant", async () => {
    // Un premier appel a déjà consommé le plus ancien ; findFirst ne retrouve donc que le second.
    findFirst.mockResolvedValue({ id: "dos2" });
    updateMany.mockResolvedValue({ count: 1 });

    const reponse = await POST(requete(SECRET), params("et1"));
    const corps = await reponse.json();

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "dos2", notificationSignatureEnvoyeeLe: null },
      data: { notificationSignatureEnvoyeeLe: expect.any(Date) },
    });
    expect(corps).toEqual({ ok: true, dejaMarque: false });
  });

  it("404 si l'étudiant n'existe pas du tout", async () => {
    findFirst.mockResolvedValue(null);
    count.mockResolvedValue(0);

    const reponse = await POST(requete(SECRET), params("inconnu"));

    expect(reponse.status).toBe(404);
  });
});
