// Pas de `import "server-only"` ici (contrairement à lib/auth.ts) : ce
// module n'est jamais importé que par des Route Handlers sous
// src/app/api/internal/n8n/ (jamais par un composant), qui sont déjà
// exclusivement exécutés côté serveur par Next — et il doit rester
// importable tel quel depuis les tests (voir auth-n8n.test.ts).
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

// Authentification machine-à-machine dédiée aux routes internes consommées
// par n8n (/api/internal/n8n/*) : un Bearer token statique partagé via
// N8N_INTERNAL_API_SECRET (.env, jamais dans le code), distinct de
// l'authentification humaine par cookie de session (requireSession/
// requireRole dans lib/auth.ts, jamais modifiées pour ce besoin — deux
// mécanismes séparés, volontairement pas mélangés). Le secret est optionnel
// au démarrage : s'il est absent, ces routes refusent tout par défaut plutôt
// que d'accepter tout, et le reste de l'app continue de fonctionner
// normalement (elle ne dépend jamais de n8n, voir CLAUDE.md).
function comparaisonSure(fourni: string, attendu: string): boolean {
  const bufferFourni = Buffer.from(fourni);
  const bufferAttendu = Buffer.from(attendu);
  // timingSafeEqual exige deux buffers de même longueur : une longueur
  // différente échoue avant la comparaison, sans fuite de temps exploitable
  // (la comparaison réelle ne s'exécute que si les longueurs correspondent
  // déjà, ce qui ne révèle rien de plus que le fait que le token n'est pas
  // le bon).
  if (bufferFourni.length !== bufferAttendu.length) return false;
  return timingSafeEqual(bufferFourni, bufferAttendu);
}

function reponseNonAutorise(): NextResponse {
  // Message volontairement générique : ne jamais indiquer si un token a été
  // fourni, s'il était juste mal formé ou simplement faux, pour ne rien
  // révéler à qui essaierait de deviner le secret.
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

// À appeler en tout premier dans chaque route sous /api/internal/n8n/ :
//   const nonAutorise = verifierAuthN8n(request);
//   if (nonAutorise) return nonAutorise;
// Retourne la réponse 401 à renvoyer telle quelle si l'auth échoue, ou null
// si la requête peut continuer.
export function verifierAuthN8n(request: NextRequest): NextResponse | null {
  const secret = process.env.N8N_INTERNAL_API_SECRET;
  if (!secret) return reponseNonAutorise();

  const enTete = request.headers.get("authorization");
  if (!enTete?.startsWith("Bearer ")) return reponseNonAutorise();

  const token = enTete.slice("Bearer ".length).trim();
  if (!token || !comparaisonSure(token, secret)) return reponseNonAutorise();

  return null;
}
