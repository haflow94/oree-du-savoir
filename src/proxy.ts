import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session-token";

// Chemins toujours autorisés tels quels (sans condition sur la query) sur le
// hostname public de la préinscription : uniquement les ressources statiques
// nécessaires au rendu de la page (next/font se sert depuis /_next/static,
// jamais /_next/image — pas de next/image sur cette page) et la favicon
// demandée automatiquement par les navigateurs. `/` et `/preinscription` ne
// sont volontairement PAS dans cette liste : ils ont chacun une condition
// propre (présence de `?a=` ou `?code=`), traitée directement dans proxy()
// ci-dessous. Tout le reste, /login et /accueil-preinscription inclus, est
// délibérément absent : ce ne sont pas des données sensibles en soi, mais ils
// ne font pas partie de « l'expérience publique de préinscription » et n'ont
// donc rien à faire joignables depuis Internet.
function cheminAutoriseSurHotePublicPreinscription(pathname: string): boolean {
  return pathname.startsWith("/_next/static/") || pathname === "/favicon.ico";
}

// Garde-fou rapide (Edge runtime) : redirige vers /login si aucun cookie de
// session n'est présent, pour éviter un flash de contenu protégé. Le
// middleware ne peut pas interroger Postgres (adaptateur `pg` = Node.js
// uniquement) : la validation réelle du token et du rôle est donc faite
// côté Server Component, dans requireSession()/requireRole() (src/lib/auth.ts),
// qui restent la véritable frontière de sécurité. /api/internal/n8n/* est
// laissé de côté par ce garde-fou (voir plus bas) : ces routes ont leur
// propre frontière, l'authentification Bearer de lib/auth-n8n.ts.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Volontairement PAS request.nextUrl.hostname : en déploiement autohébergé
  // (`next start` sans `-H`, voir entrypoint.sh), Next.js reconstruit
  // toujours l'URL interne passée au middleware avec un hostname figé
  // ("localhost" par défaut — voir runMiddleware dans
  // next/dist/server/next-server.js, qui utilise `this.fetchHostname ||
  // 'localhost'`, `fetchHostname` ne venant que du flag `-H` jamais passé
  // ici), quel que soit le Host HTTP réel envoyé par le tunnel. Le header
  // Host brut, lui, est transmis tel quel au middleware : c'est la seule
  // source fiable du hostname public réellement demandé.
  const hostname = request.headers.get("host")?.split(":")[0] ?? "";

  // Cloisonnement par hostname : tant que la route Cloudflare Tunnel reste
  // en wildcard (voir ARCHITECTURE-PREINSCRIPTION.md), c'est ici, dans
  // l'application elle-même, que le hostname public de la préinscription
  // est techniquement limité à cette seule expérience — l'authentification
  // de l'app privée (ci-dessous) n'est volontairement pas considérée comme
  // suffisante pour ce hostname. `PREINSCRIPTION_PUBLIC_HOSTNAME` vide (par
  // défaut, en dev comme sur le LAN tant qu'elle n'est pas positionnée en
  // prod) désactive entièrement ce contrôle, sans effet sur le reste.
  const hotePublicPreinscription = process.env.PREINSCRIPTION_PUBLIC_HOSTNAME;
  if (hotePublicPreinscription && hostname === hotePublicPreinscription) {
    // Adresse officielle du QR permanent (voir /inscriptions) : `/` est
    // réécrit en interne vers /preinscription — l'utilisateur garde `/`
    // dans sa barre d'adresse (réécriture, pas redirection). Le jeton
    // permanent (`?a=...`) n'est volontairement PAS vérifié ici : le
    // middleware Edge ne peut pas interroger Postgres (voir le commentaire
    // en tête de fichier) — seule sa PRÉSENCE est contrôlée, pour qu'un
    // robot qui ne connaît que le hostname (sans être passé par le QR) ne
    // puisse même pas atteindre la page. La validité réelle du jeton
    // (comparaison à son hash stocké en base) est vérifiée côté Server
    // Component, dans src/app/preinscription/page.tsx — la même frontière
    // que pour CodePreinscription.
    if (pathname === "/") {
      if (!request.nextUrl.searchParams.get("a")) {
        return new NextResponse("Not found", { status: 404 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/preinscription";
      return NextResponse.rewrite(url);
    }
    // /preinscription ne reste directement joignable sur ce hostname que
    // pour les anciens liens e-mail à code (`?code=...`, voir
    // src/lib/preinscription-code.ts) : depuis l'introduction du jeton
    // permanent, `/` est désormais le SEUL point d'entrée public sans code
    // — visiter /preinscription sans `?code=` ici (avec ou sans `?a=`) doit
    // 404, jamais ouvrir le formulaire en contournant `/`. Même limite que
    // pour `/` ci-dessus : seule la présence de `code` est vérifiable ici
    // (pas Postgres, voir le commentaire en tête de fichier) — sa validité
    // réelle reste vérifiée par src/app/preinscription/page.tsx, inchangé.
    if (pathname === "/preinscription" && request.nextUrl.searchParams.get("code")) {
      return NextResponse.next();
    }
    if (cheminAutoriseSurHotePublicPreinscription(pathname)) {
      return NextResponse.next();
    }
    // 404 générique plutôt que 403 : ne pas laisser deviner depuis
    // l'extérieur qu'une application privée existe derrière ce hostname.
    return new NextResponse("Not found", { status: 404 });
  }

  // Chemins non couverts par la vérification de cookie ci-dessous — mêmes
  // exclusions que l'ancien `config.matcher` (voir git history), reproduites
  // ici en code plutôt qu'en regex de matcher pour que le contrôle de
  // hostname ci-dessus s'applique bien à toutes les routes, y compris
  // celles-ci.
  const cheminNonProtege =
    pathname === "/login" ||
    pathname === "/preinscription" ||
    pathname === "/accueil-preinscription" ||
    // Page publique de vérification/signature du dossier (voir
    // src/app/dossier/[token]/) : accès porté entièrement par le token de
    // l'URL (lib/acces-dossier.ts), jamais par un cookie de session — même
    // principe que /preinscription.
    pathname.startsWith("/dossier/") ||
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo-loree-du-savoir.png";

  if (cheminNonProtege) {
    return NextResponse.next();
  }

  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);

  if (!hasSessionCookie) {
    // Ne fait rien pour /api/internal/n8n/* : ces routes sont authentifiées
    // par Bearer token (voir lib/auth-n8n.ts), jamais par cookie de session
    // — les laisser passer ici pour que le 401/200 réel vienne du handler,
    // pas d'une redirection HTML vers /login qui casserait tout appel
    // machine (n8n ne suit pas de redirection vers une page de connexion).
    if (pathname.startsWith("/api/internal/n8n/")) {
      return NextResponse.next();
    }
    // Webhook Documenso (voir src/app/api/webhooks/documenso/route.ts) :
    // authentifié par son propre secret partagé (en-tête
    // X-Documenso-Secret), jamais par cookie — même raison que ci-dessus,
    // Documenso ne suit pas de redirection vers /login.
    if (pathname.startsWith("/api/webhooks/")) {
      return NextResponse.next();
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Toutes les routes, y compris celles historiquement exclues
     * (/login, /preinscription, /accueil-preinscription, ressources
     * statiques Next, favicon, logo) : le contrôle de hostname en tête de
     * fonction doit pouvoir les intercepter quand la requête arrive par le
     * hostname public de la préinscription. Ces chemins restent toutefois
     * exemptés de la vérification de cookie de session via
     * `cheminNonProtege` ci-dessus, exactement comme avant.
     */
    "/:path*",
  ],
};
