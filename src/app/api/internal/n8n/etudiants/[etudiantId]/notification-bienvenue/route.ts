import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";

// À appeler par n8n juste après l'envoi réussi de l'email de bienvenue (voir
// GET .../inscriptions-a-notifier). Idempotent par construction : le
// updateMany ne pose la date que si elle est encore null, jamais un simple
// update qui écraserait une date déjà posée — un second appel (retry n8n,
// exécution répétée) ne fait jamais repartir le compteur ni échouer.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ etudiantId: string }> },
) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const { etudiantId } = await params;

  const resultat = await prisma.etudiant.updateMany({
    where: { id: etudiantId, notificationBienvenueEnvoyeeLe: null },
    data: { notificationBienvenueEnvoyeeLe: new Date() },
  });

  if (resultat.count === 1) {
    return NextResponse.json({ ok: true, dejaMarque: false });
  }

  // count === 0 : soit l'étudiant n'existe pas, soit il était déjà marqué —
  // à distinguer pour ne pas masquer une erreur d'id côté n8n derrière un
  // faux "déjà envoyé".
  const existe = await prisma.etudiant.count({ where: { id: etudiantId } });
  if (existe === 0) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, dejaMarque: true });
}
