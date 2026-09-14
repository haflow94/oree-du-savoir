import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";

// À appeler par n8n juste après l'envoi réussi de l'email "signature
// confirmée" (voir GET .../dossiers-signes-a-notifier). Le champ vit sur
// DossierAnnuel (notificationSignatureEnvoyeeLe), pas sur Etudiant — un
// étudiant réinscrit peut avoir plusieurs dossiers annuels SIGNEE non
// notifiés en même temps (cas rare mais possible, sur deux années scolaires
// qui se chevauchent). L'URL reste scopée par etudiantId (même forme que
// .../notification-bienvenue) mais on ne marque jamais qu'UN SEUL dossier
// par appel : le plus ancien signé non encore notifié, même ordre que GET
// .../dossiers-signes-a-notifier (orderBy signeLe asc). Un updateMany
// aveugle sur etudiantId marquerait à tort plusieurs dossiers comme
// notifiés pour un seul email réellement envoyé — un candidat GET = un
// appel POST côté n8n.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ etudiantId: string }> },
) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const { etudiantId } = await params;

  const dossier = await prisma.dossierAnnuel.findFirst({
    where: { etudiantId, statutSignature: "SIGNEE", notificationSignatureEnvoyeeLe: null },
    orderBy: { signeLe: "asc" },
    select: { id: true },
  });

  if (!dossier) {
    // Aucun dossier à marquer : soit l'étudiant n'existe pas, soit tous ses
    // dossiers signés sont déjà notifiés — à distinguer pour ne pas masquer
    // une erreur d'id côté n8n derrière un faux "déjà envoyé".
    const existe = await prisma.etudiant.count({ where: { id: etudiantId } });
    if (existe === 0) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, dejaMarque: true });
  }

  // Idempotent par construction (même patron que .../dossiers-a-verifier/
  // .../notifie) : le updateMany ne pose la date que si elle est encore
  // null, jamais un simple update qui écraserait une date déjà posée par un
  // appel concurrent.
  const resultat = await prisma.dossierAnnuel.updateMany({
    where: { id: dossier.id, notificationSignatureEnvoyeeLe: null },
    data: { notificationSignatureEnvoyeeLe: new Date() },
  });

  return NextResponse.json({ ok: true, dejaMarque: resultat.count === 0 });
}
