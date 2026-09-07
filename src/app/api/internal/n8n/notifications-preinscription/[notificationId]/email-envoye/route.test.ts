import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const updateMany = vi.fn();
const count = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationPreinscription: {
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
    "http://localhost/api/internal/n8n/notifications-preinscription/notif1/email-envoye",
    { method: "POST", headers },
  );
}

function params(notificationId: string) {
  return { params: Promise.resolve({ notificationId }) };
}

describe("POST /api/internal/n8n/notifications-preinscription/[notificationId]/email-envoye", () => {
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
    const reponse = await POST(requete(), params("notif1"));
    expect(reponse.status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("marque la notification à son premier appel", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const reponse = await POST(requete(SECRET), params("notif1"));
    const corps = await reponse.json();
    expect(reponse.status).toBe(200);
    expect(corps).toEqual({ ok: true, dejaMarque: false });
    expect(count).not.toHaveBeenCalled();
  });

  it("un second appel (retry n8n) reste idempotent : dejaMarque=true, jamais d'erreur", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    count.mockResolvedValue(1); // la notification existe toujours, juste déjà marquée
    const reponse = await POST(requete(SECRET), params("notif1"));
    const corps = await reponse.json();
    expect(reponse.status).toBe(200);
    expect(corps).toEqual({ ok: true, dejaMarque: true });
  });

  it("404 si la notification n'existe pas du tout", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    count.mockResolvedValue(0);
    const reponse = await POST(requete(SECRET), params("inconnue"));
    expect(reponse.status).toBe(404);
  });
});
