import { NextResponse, type NextRequest } from "next/server";
import { obtenirOuCreerCodeAccueilAuto } from "@/lib/preinscription-code";
import { adresseIpClient, limiteDebitDepassee } from "@/lib/rate-limit";

// Lien stable imprimé/affiché une seule fois à l'accueil (voir la carte "QR
// d'accueil" de (app)/inscriptions/page.tsx) : redirige systématiquement
// vers /preinscription?code=... avec le code accueil actuellement en cours,
// régénéré automatiquement à la demande (voir
// obtenirOuCreerCodeAccueilAuto, src/lib/preinscription-code.ts) — jamais de
// réimpression du QR à prévoir.
//
// Limitation de débit dédiée (clé séparée de celles de /preinscription) :
// seuil volontairement généreux, plusieurs familles pouvant scanner depuis
// la même IP partagée (Wi-Fi de l'accueil) en quelques minutes.
export async function GET(request: NextRequest) {
  const ip = await adresseIpClient(request.headers);
  if (limiteDebitDepassee(`accueil-preinscription:${ip}`, 60, 10 * 60 * 1000)) {
    return new NextResponse(
      "Trop de tentatives depuis cette connexion. Merci de réessayer dans quelques minutes.",
      { status: 429 },
    );
  }

  const { code } = await obtenirOuCreerCodeAccueilAuto();
  const url = new URL("/preinscription", request.url);
  url.searchParams.set("code", code);
  return NextResponse.redirect(url);
}
