import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { verifierAuthN8n } from "./auth-n8n";

const SECRET = "s".repeat(64);

function requete(token?: string): NextRequest {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/internal/n8n/health", { headers });
}

describe("verifierAuthN8n", () => {
  const original = process.env.N8N_INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = original;
  });

  it("refuse une requête sans en-tête Authorization", async () => {
    const reponse = verifierAuthN8n(requete());
    expect(reponse?.status).toBe(401);
  });

  it("refuse un mauvais token", () => {
    const reponse = verifierAuthN8n(requete("mauvais-token"));
    expect(reponse?.status).toBe(401);
  });

  it("refuse un en-tête mal formé (sans préfixe Bearer)", () => {
    const headers = new Headers({ authorization: SECRET });
    const reponse = verifierAuthN8n(
      new NextRequest("http://localhost/api/internal/n8n/health", { headers }),
    );
    expect(reponse?.status).toBe(401);
  });

  it("accepte le bon token", () => {
    const reponse = verifierAuthN8n(requete(SECRET));
    expect(reponse).toBeNull();
  });

  it("refuse tout si le secret n'est pas configuré côté app, même avec le bon token en clair", () => {
    delete process.env.N8N_INTERNAL_API_SECRET;
    const reponse = verifierAuthN8n(requete(SECRET));
    expect(reponse?.status).toBe(401);
  });

  it("ne fait jamais fuiter le secret dans le corps de la réponse d'erreur", async () => {
    const reponse = verifierAuthN8n(requete("mauvais-token"));
    const corps = await reponse!.text();
    expect(corps).not.toContain(SECRET);
  });
});
