import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session-token";

// Garde-fou rapide (Edge runtime) : redirige vers /login si aucun cookie de
// session n'est présent, pour éviter un flash de contenu protégé. Le
// middleware ne peut pas interroger Postgres (adaptateur `pg` = Node.js
// uniquement) : la validation réelle du token et du rôle est donc faite
// côté Server Component, dans requireSession()/requireRole() (src/lib/auth.ts),
// qui restent la véritable frontière de sécurité. /api/internal/n8n/* est
// laissé de côté par ce garde-fou (voir plus bas) : ces routes ont leur
// propre frontière, l'authentification Bearer de lib/auth-n8n.ts.
export function proxy(request: NextRequest) {
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);

  if (!hasSessionCookie) {
    // Ne fait rien pour /api/internal/n8n/* : ces routes sont authentifiées
    // par Bearer token (voir lib/auth-n8n.ts), jamais par cookie de session
    // — les laisser passer ici pour que le 401/200 réel vienne du handler,
    // pas d'une redirection HTML vers /login qui casserait tout appel
    // machine (n8n ne suit pas de redirection vers une page de connexion).
    if (request.nextUrl.pathname.startsWith("/api/internal/n8n/")) {
      return NextResponse.next();
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Toutes les routes sauf :
     * - /login (page de connexion elle-même)
     * - /preinscription (formulaire public, sans compte)
     * - ressources statiques Next.js, favicon et logo
     *
     * Les fichiers sous /public doivent rester exclus : next/image résout
     * une image locale via une requête interne simulée qui ne transmet
     * jamais les cookies (voir next/dist/server/image-optimizer.js,
     * fetchInternalImage) — sans cette exclusion, ce garde-fou la
     * redirigerait systématiquement vers /login et casserait l'image pour
     * tout le monde, connecté ou non.
     */
    "/((?!login|preinscription|_next/static|_next/image|favicon.ico|logo-loree-du-savoir.png).*)",
  ],
};
