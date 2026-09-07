import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";

// À appeler par n8n juste après l'envoi réussi de l'email "dossier prêt à
// vérifier" (voir GET .../dossiers-a-verifier). Idempotent par construction
// (même patron que .../notifications-preinscription/.../email-envoye) : le
// updateMany ne pose la date que si elle est encore null.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dossierAnnuelId: string }> },
) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const { dossierAnnuelId } = await params;

  const resultat = await prisma.dossierAnnuel.updateMany({
    where: { id: dossierAnnuelId, notificationVerificationEnvoyeeLe: null },
    data: { notificationVerificationEnvoyeeLe: new Date() },
  });

  if (resultat.count === 1) {
    return NextResponse.json({ ok: true, dejaMarque: false });
  }

  const existe = await prisma.dossierAnnuel.count({ where: { id: dossierAnnuelId } });
  if (existe === 0) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, dejaMarque: true });
}
