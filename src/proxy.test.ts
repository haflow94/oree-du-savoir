import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { SESSION_COOKIE_NAME } from "@/lib/session-token";

function requete(path: string, options?: { avecCookieSession?: boolean }): NextRequest {
  const headers = new Headers();
  if (options?.avecCookieSession) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=un-token`);
  }
  return new NextRequest(new URL(path, "http://localhost"), { headers });
}

describe("proxy (middleware Edge)", () => {
  it("redirige vers /login une route humaine protégée sans cookie de session", () => {
    const reponse = proxy(requete("/etudiants"));
    expect(reponse.status).toBe(307);
    expect(reponse.headers.get("location")).toContain("/login");
  });

  it("laisse passer une route humaine protégée avec un cookie de session", () => {
    const reponse = proxy(requete("/etudiants", { avecCookieSession: true }));
    expect(reponse.status).not.toBe(307);
    expect(reponse.headers.get("location")).toBeNull();
  });

  it("laisse passer /api/internal/n8n/* sans cookie de session, sans redirection vers /login", () => {
    const reponse = proxy(requete("/api/internal/n8n/health"));
    expect(reponse.status).not.toBe(307);
    expect(reponse.headers.get("location")).toBeNull();
  });
});
