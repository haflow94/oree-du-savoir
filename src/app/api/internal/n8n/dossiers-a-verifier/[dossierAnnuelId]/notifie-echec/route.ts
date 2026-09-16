import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";

// À appeler par n8n depuis le nœud Error Trigger du workflow d'envoi de
// l'email "dossier prêt à vérifier" (voir GET .../dossiers-a-verifier et POST
// .../notifie, l'équivalent succès). Même patron que
// .../etudiants/[etudiantId]/notification-bienvenue-echec : écrase toujours
// le dernier échec connu, ne touche jamais notificationVerificationEnvoyeeLe.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dossierAnnuelId: string }> },
) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const { dossierAnnuelId } = await params;

  const corps: unknown = await request.json().catch(() => null);
  const message =
    corps && typeof corps === "object" && "message" in corps
      ? (corps as { message: unknown }).message
      : null;
  if (typeof message !== "string" || message.trim() === "") {
    return NextResponse.json({ error: "message invalide" }, { status: 400 });
  }

  const resultat = await prisma.dossierAnnuel.updateMany({
    where: { id: dossierAnnuelId },
    data: {
      notificationVerificationErreurLe: new Date(),
      notificationVerificationErreurMessage: message,
    },
  });

  if (resultat.count === 0) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
