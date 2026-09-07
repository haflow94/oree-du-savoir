import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";

// À appeler par n8n juste après l'envoi réussi de l'e-mail au responsable
// (voir GET .../preinscriptions-a-notifier). Idempotent par construction :
// le updateMany ne pose la date que si elle est encore null, jamais un
// simple update qui écraserait une date déjà posée — un second appel (retry
// n8n, exécution répétée) ne fait jamais repartir le candidat ni échouer.
// Même patron que POST .../etudiants/[id]/notification-bienvenue.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ notificationId: string }> },
) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const { notificationId } = await params;

  const resultat = await prisma.notificationPreinscription.updateMany({
    where: { id: notificationId, notifieParEmailLe: null },
    data: { notifieParEmailLe: new Date() },
  });

  if (resultat.count === 1) {
    return NextResponse.json({ ok: true, dejaMarque: false });
  }

  // count === 0 : soit la notification n'existe pas, soit elle était déjà
  // marquée — à distinguer pour ne pas masquer une erreur d'id côté n8n
  // derrière un faux "déjà envoyé".
  const existe = await prisma.notificationPreinscription.count({ where: { id: notificationId } });
  if (existe === 0) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, dejaMarque: true });
}
