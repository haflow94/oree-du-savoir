import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";

// À appeler par n8n depuis le nœud Error Trigger du workflow d'envoi de
// l'email de bienvenue (voir GET .../inscriptions-a-notifier et POST
// .../notification-bienvenue, l'équivalent succès). Écrase toujours le
// dernier échec connu (pas d'historique) sans jamais toucher
// notificationBienvenueEnvoyeeLe — un échec ne doit jamais effacer un envoi
// déjà réussi. n8n continuera de retenter ce candidat au prochain cycle tant
// que notificationBienvenueEnvoyeeLe reste null ; POST .../notification-bienvenue
// efface ces champs dès qu'une tentative finit par réussir.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ etudiantId: string }> },
) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const { etudiantId } = await params;

  const corps: unknown = await request.json().catch(() => null);
  const message =
    corps && typeof corps === "object" && "message" in corps
      ? (corps as { message: unknown }).message
      : null;
  if (typeof message !== "string" || message.trim() === "") {
    return NextResponse.json({ error: "message invalide" }, { status: 400 });
  }

  const resultat = await prisma.etudiant.updateMany({
    where: { id: etudiantId },
    data: { notificationBienvenueErreurLe: new Date(), notificationBienvenueErreurMessage: message },
  });

  if (resultat.count === 0) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
