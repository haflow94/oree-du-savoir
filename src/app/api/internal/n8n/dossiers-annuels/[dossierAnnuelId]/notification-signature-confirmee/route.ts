import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";

// À appeler par n8n juste après l'envoi réussi de l'email "signature
// confirmée" (voir GET .../dossiers-signes-a-notifier, qui expose
// dossierAnnuelId sur chaque candidat). Scopé par dossierAnnuelId — pas par
// etudiantId — même patron que .../dossiers-a-verifier/[dossierAnnuelId]/notifie
// : un candidat GET = un id précis = un appel POST, jamais de "plus ancien
// dossier non notifié" redeviné côté serveur. Cette route remplace
// l'ancienne .../etudiants/[etudiantId]/notification-signature-confirmee,
// qui redevinait le dossier à marquer via un findFirst séparé de
// l'updateMany : deux appels n8n concurrents pour deux dossiers SIGNEE
// distincts d'un même étudiant réinscrit pouvaient tous les deux retrouver
// le même "plus ancien" dossier, laissant l'autre — pourtant réellement
// notifié par email — sans jamais être marqué (candidat perpétuel, email
// dupliqué à chaque prochain cycle).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dossierAnnuelId: string }> },
) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const { dossierAnnuelId } = await params;

  const resultat = await prisma.dossierAnnuel.updateMany({
    where: { id: dossierAnnuelId, notificationSignatureEnvoyeeLe: null },
    data: { notificationSignatureEnvoyeeLe: new Date() },
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
