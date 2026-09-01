import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const SECRET = "s".repeat(64);

function requete(token?: string): NextRequest {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/internal/n8n/health", { headers });
}

describe("GET /api/internal/n8n/health", () => {
  const original = process.env.N8N_INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = original;
  });

  it("401 sans token", async () => {
    const reponse = await GET(requete());
    expect(reponse.status).toBe(401);
  });

  it("401 avec un mauvais token", async () => {
    const reponse = await GET(requete("mauvais-token"));
    expect(reponse.status).toBe(401);
  });

  it("200 avec le bon token", async () => {
    const reponse = await GET(requete(SECRET));
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ ok: true });
  });
});
