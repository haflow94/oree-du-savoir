import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { SESSION_COOKIE_NAME } from "@/lib/session-token";

const HOTE_PUBLIC = "preinscription.loreedusavoir.fr";

// L'URL de la NextRequest reste volontairement fixée sur "localhost" quel
// que soit `options.host` : c'est exactement ce que fait Next.js en
// production avec `next start` sans `-H` (voir le commentaire dans
// src/proxy.ts) — request.nextUrl ne reflète jamais le vrai Host demandé,
// seul le header `Host` le porte. Un test qui construirait l'URL avec le
// hostname public ne reproduirait pas ce comportement et ne détecterait pas
// une régression qui réintroduirait `request.nextUrl.hostname`.
function requete(
  path: string,
  options?: { avecCookieSession?: boolean; host?: string },
): NextRequest {
  const headers = new Headers();
  if (options?.avecCookieSession) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=un-token`);
  }
  if (options?.host) {
    headers.set("host", options.host);
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

  describe("cloisonnement par hostname public (PREINSCRIPTION_PUBLIC_HOSTNAME)", () => {
    afterEach(() => {
      delete process.env.PREINSCRIPTION_PUBLIC_HOSTNAME;
    });

    it("refuse /preinscription sans code depuis le hostname public (/ est le seul point d'entrée sans code)", () => {
      process.env.PREINSCRIPTION_PUBLIC_HOSTNAME = HOTE_PUBLIC;
      const reponse = proxy(requete("/preinscription", { host: HOTE_PUBLIC }));
      expect(reponse.status).toBe(404);
    });

    it("refuse /preinscription avec un jeton mais sans code (ne contourne pas /)", () => {
      process.env.PREINSCRIPTION_PUBLIC_HOSTNAME = HOTE_PUBLIC;
      const reponse = proxy(requete("/preinscription?a=un-jeton", { host: HOTE_PUBLIC }));
      expect(reponse.status).toBe(404);
    });

    it("autorise /preinscription?code=... depuis le hostname public (ancien lien e-mail)", () => {
      process.env.PREINSCRIPTION_PUBLIC_HOSTNAME = HOTE_PUBLIC;
      const reponse = proxy(requete("/preinscription?code=ABCDE-12345", { host: HOTE_PUBLIC }));
      expect(reponse.status).toBe(200);
    });

    it("réécrit / avec un jeton vers /preinscription, en conservant l'URL visible à /", () => {
      process.env.PREINSCRIPTION_PUBLIC_HOSTNAME = HOTE_PUBLIC;
      const reponse = proxy(requete("/?a=un-jeton", { host: HOTE_PUBLIC }));
      expect(reponse.status).toBe(200);
      // Une réécriture (rewrite) laisse l'URL du navigateur inchangée : pas
      // de redirection, donc pas de header Location.
      expect(reponse.headers.get("location")).toBeNull();
      expect(reponse.headers.get("x-middleware-rewrite")).toContain("/preinscription");
      expect(reponse.headers.get("x-middleware-rewrite")).toContain("a=un-jeton");
    });

    it("refuse / sans jeton depuis le hostname public (aucune vérification de validité possible ici, seule la présence compte)", () => {
      process.env.PREINSCRIPTION_PUBLIC_HOSTNAME = HOTE_PUBLIC;
      const reponse = proxy(requete("/", { host: HOTE_PUBLIC }));
      expect(reponse.status).toBe(404);
    });

    it("autorise les ressources Next.js nécessaires (_next/static, favicon) depuis le hostname public", () => {
      process.env.PREINSCRIPTION_PUBLIC_HOSTNAME = HOTE_PUBLIC;
      const reponseChunk = proxy(
        requete("/_next/static/chunks/main.js", { host: HOTE_PUBLIC }),
      );
      expect(reponseChunk.status).toBe(200);

      const reponseFavicon = proxy(requete("/favicon.ico", { host: HOTE_PUBLIC }));
      expect(reponseFavicon.status).toBe(200);
    });

    it("refuse /administration depuis le hostname public", () => {
      process.env.PREINSCRIPTION_PUBLIC_HOSTNAME = HOTE_PUBLIC;
      const reponse = proxy(
        requete("/administration", { host: HOTE_PUBLIC, avecCookieSession: true }),
      );
      expect(reponse.status).toBe(404);
    });

    it("refuse /etudiants depuis le hostname public", () => {
      process.env.PREINSCRIPTION_PUBLIC_HOSTNAME = HOTE_PUBLIC;
      const reponse = proxy(
        requete("/etudiants", { host: HOTE_PUBLIC, avecCookieSession: true }),
      );
      expect(reponse.status).toBe(404);
    });

    it("refuse /api/internal/n8n/* depuis le hostname public, même sans cookie", () => {
      process.env.PREINSCRIPTION_PUBLIC_HOSTNAME = HOTE_PUBLIC;
      const reponse = proxy(requete("/api/internal/n8n/health", { host: HOTE_PUBLIC }));
      expect(reponse.status).toBe(404);
    });

    it("refuse aussi /login et /accueil-preinscription depuis le hostname public", () => {
      process.env.PREINSCRIPTION_PUBLIC_HOSTNAME = HOTE_PUBLIC;
      expect(proxy(requete("/login", { host: HOTE_PUBLIC })).status).toBe(404);
      expect(
        proxy(requete("/accueil-preinscription", { host: HOTE_PUBLIC })).status,
      ).toBe(404);
    });

    it("autorise /dossier/[token] et /dossier/[token]/pdf depuis le hostname public (accès porté par le token de l'URL, pas par la session)", () => {
      process.env.PREINSCRIPTION_PUBLIC_HOSTNAME = HOTE_PUBLIC;
      expect(
        proxy(requete("/dossier/un-token", { host: HOTE_PUBLIC })).status,
      ).toBe(200);
      expect(
        proxy(requete("/dossier/un-token/pdf", { host: HOTE_PUBLIC })).status,
      ).toBe(200);
    });

    it("laisse '/' intact sur le hostname LAN (tableau de bord protégé par la session, non affecté par le cloisonnement public)", () => {
      process.env.PREINSCRIPTION_PUBLIC_HOSTNAME = HOTE_PUBLIC;
      const sansCookie = proxy(requete("/", { host: "localhost" }));
      expect(sansCookie.status).toBe(307);
      expect(sansCookie.headers.get("location")).toContain("/login");

      const avecCookie = proxy(requete("/", { host: "localhost", avecCookieSession: true }));
      expect(avecCookie.status).not.toBe(307);
      expect(avecCookie.headers.get("x-middleware-rewrite")).toBeNull();
    });

    it("laisse le hostname LAN normal inchangé quand la variable d'env est positionnée", () => {
      process.env.PREINSCRIPTION_PUBLIC_HOSTNAME = HOTE_PUBLIC;
      const sansCookie = proxy(requete("/etudiants", { host: "localhost" }));
      expect(sansCookie.status).toBe(307);
      expect(sansCookie.headers.get("location")).toContain("/login");

      const avecCookie = proxy(
        requete("/etudiants", { host: "localhost", avecCookieSession: true }),
      );
      expect(avecCookie.status).not.toBe(307);
    });

    it("sans variable d'env positionnée, le hostname public ne bénéficie d'aucun cloisonnement particulier (comportement désactivé)", () => {
      const reponse = proxy(requete("/etudiants", { host: HOTE_PUBLIC }));
      expect(reponse.status).toBe(307);
      expect(reponse.headers.get("location")).toContain("/login");
    });
  });
});
