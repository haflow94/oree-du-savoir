import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const obtenirOuCreerCodeAccueilAuto = vi.fn();
vi.mock("@/lib/preinscription-code", () => ({
  obtenirOuCreerCodeAccueilAuto: (...args: unknown[]) => obtenirOuCreerCodeAccueilAuto(...args),
}));

const { GET } = await import("./route");

function requete(ip = "203.0.113.1"): NextRequest {
  const headers = new Headers({ "x-forwarded-for": ip });
  return new NextRequest("http://localhost/accueil-preinscription", { headers });
}

describe("GET /accueil-preinscription", () => {
  afterEach(() => vi.clearAllMocks());

  it("redirige vers /preinscription avec le code accueil en cours", async () => {
    obtenirOuCreerCodeAccueilAuto.mockResolvedValueOnce({ code: "ABCDE-12345" });
    const reponse = await GET(requete());
    expect(reponse.status).toBe(307);
    const location = new URL(reponse.headers.get("location")!);
    expect(location.pathname).toBe("/preinscription");
    expect(location.searchParams.get("code")).toBe("ABCDE-12345");
  });

  it("bloque au-delà du seuil de tentatives pour une même IP", async () => {
    obtenirOuCreerCodeAccueilAuto.mockResolvedValue({ code: "ABCDE-12345" });
    const ip = `198.51.100.${Math.floor(Math.random() * 255)}`;
    for (let i = 0; i < 60; i++) {
      const reponse = await GET(requete(ip));
      expect(reponse.status).toBe(307);
    }
    const bloque = await GET(requete(ip));
    expect(bloque.status).toBe(429);
  });
});
