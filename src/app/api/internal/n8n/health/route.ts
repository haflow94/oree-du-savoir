import { NextResponse, type NextRequest } from "next/server";
import { verifierAuthN8n } from "@/lib/auth-n8n";

// Point de contrôle pour valider la connectivité + l'authentification
// Bearer avant de construire les workflows métier (voir CLAUDE.md section
// n8n) : ne renvoie aucune donnée sensible, juste une confirmation que le
// token présenté est valide.
export async function GET(request: NextRequest) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  return NextResponse.json({ ok: true });
}
