import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session-token";

// Garde-fou rapide (Edge runtime) : redirige vers /login si aucun cookie de
// session n'est présent, pour éviter un flash de contenu protégé. Le
// middleware ne peut pas interroger Postgres (adaptateur `pg` = Node.js
// uniquement) : la validation réelle du token et du rôle est donc faite
// côté Server Component, dans requireSession()/requireRole() (src/lib/auth.ts),
// qui restent la véritable frontière de sécurité.
export function middleware(request: NextRequest) {
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);

  if (!hasSessionCookie) {
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
     * - ressources statiques Next.js et favicon
     */
    "/((?!login|_next/static|_next/image|favicon.ico).*)",
  ],
};
