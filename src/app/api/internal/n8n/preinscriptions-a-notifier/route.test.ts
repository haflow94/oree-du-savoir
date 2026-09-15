import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { notificationPreinscription: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

const { GET } = await import("./route");

const SECRET = "s".repeat(64);

function requete(token?: string): NextRequest {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/internal/n8n/preinscriptions-a-notifier", {
    headers,
  });
}

describe("GET /api/internal/n8n/preinscriptions-a-notifier", () => {
  const originalSecret = process.env.N8N_INTERNAL_API_SECRET;
  const originalPublicHost = process.env.PUBLIC_HOST;

  beforeEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = SECRET;
    delete process.env.PUBLIC_HOST;
    findMany.mockReset();
  });

  afterEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = originalSecret;
    process.env.PUBLIC_HOST = originalPublicHost;
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

  it("ne renvoie que les notifications pas encore envoyées par e-mail", async () => {
    findMany.mockResolvedValue([
      {
        id: "notif1",
        creeLe: new Date("2026-09-07T10:00:00.000Z"),
        etudiant: { id: "et1", nom: "Dupont", prenom: "Ali" },
      },
    ]);

    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();

    expect(reponse.status).toBe(200);
    expect(findMany.mock.calls[0][0].where).toEqual({
      notifieParEmailLe: null,
      etudiant: { anonymiseLe: null },
    });
    expect(corps.candidats).toEqual([
      {
        notificationId: "notif1",
        etudiantId: "et1",
        nom: "Dupont",
        prenom: "Ali",
        creeLe: "2026-09-07T10:00:00.000Z",
        lien: "/etudiants/et1",
      },
    ]);
  });

  it("construit un lien absolu quand PUBLIC_HOST est configuré", async () => {
    process.env.PUBLIC_HOST = "192.168.1.38:3000";
    findMany.mockResolvedValue([
      {
        id: "notif1",
        creeLe: new Date("2026-09-07T10:00:00.000Z"),
        etudiant: { id: "et1", nom: "Dupont", prenom: "Ali" },
      },
    ]);

    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();

    expect(corps.candidats[0].lien).toBe("http://192.168.1.38:3000/etudiants/et1");
  });

  it("renvoie une liste vide sans notification en attente", async () => {
    findMany.mockResolvedValue([]);
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps.candidats).toEqual([]);
  });
});
