import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";

// À appeler par n8n juste après l'envoi réussi d'une relance (voir GET
// .../dossiers-a-relancer, qui indique le numeroRelance attendu pour ce
// dossier). Idempotent par construction sur un compteur (contrairement à un
// simple booléen/date comme notification-bienvenue) : le updateMany
// n'incrémente que si nombreRelancesEnvoyees vaut encore numeroRelance - 1
// au moment de l'appel — un retry ou une double exécution n8n avec le même
// numeroRelance n'incrémente jamais deux fois.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dossierAnnuelId: string }> },
) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const { dossierAnnuelId } = await params;

  const corps: unknown = await request.json().catch(() => null);
  const numeroRelance =
    corps && typeof corps === "object" && "numeroRelance" in corps
      ? (corps as { numeroRelance: unknown }).numeroRelance
      : null;
  if (typeof numeroRelance !== "number" || !Number.isInteger(numeroRelance) || numeroRelance < 1) {
    return NextResponse.json({ error: "numeroRelance invalide" }, { status: 400 });
  }

  const resultat = await prisma.dossierAnnuel.updateMany({
    where: { id: dossierAnnuelId, nombreRelancesEnvoyees: numeroRelance - 1 },
    data: { nombreRelancesEnvoyees: numeroRelance, derniereRelanceEnvoyeeLe: new Date() },
  });

  if (resultat.count === 1) {
    return NextResponse.json({ ok: true, dejaMarque: false });
  }

  // count === 0 : soit le dossier n'existe pas, soit numeroRelance ne
  // correspond plus au compteur actuel (déjà marqué par un appel précédent,
  // ou appel hors ordre) — à distinguer pour ne pas masquer une erreur d'id
  // côté n8n derrière un faux "déjà envoyé".
  const dossier = await prisma.dossierAnnuel.findUnique({
    where: { id: dossierAnnuelId },
    select: { nombreRelancesEnvoyees: true },
  });
  if (!dossier) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    dejaMarque: true,
    nombreRelancesEnvoyees: dossier.nombreRelancesEnvoyees,
  });
}
