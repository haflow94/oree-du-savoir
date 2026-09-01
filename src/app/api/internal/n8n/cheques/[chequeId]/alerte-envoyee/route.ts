import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";

// À appeler par n8n juste après l'envoi réussi de l'alerte interne (voir GET
// .../cheques-a-alerter, qui indique le numeroAlerte attendu pour ce
// chèque). Idempotent par construction sur un compteur, même mécanique que
// .../dossiers-annuels/[id]/relance-envoyee : le updateMany n'incrémente que
// si nombreAlertesEnvoyees vaut encore numeroAlerte - 1 au moment de
// l'appel — un retry ou une double exécution n8n avec le même numeroAlerte
// n'incrémente jamais deux fois.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chequeId: string }> },
) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const { chequeId } = await params;

  const corps: unknown = await request.json().catch(() => null);
  const numeroAlerte =
    corps && typeof corps === "object" && "numeroAlerte" in corps
      ? (corps as { numeroAlerte: unknown }).numeroAlerte
      : null;
  if (typeof numeroAlerte !== "number" || !Number.isInteger(numeroAlerte) || numeroAlerte < 1) {
    return NextResponse.json({ error: "numeroAlerte invalide" }, { status: 400 });
  }

  const resultat = await prisma.cheque.updateMany({
    where: { id: chequeId, nombreAlertesEnvoyees: numeroAlerte - 1 },
    data: { nombreAlertesEnvoyees: numeroAlerte, derniereAlerteEnvoyeeLe: new Date() },
  });

  if (resultat.count === 1) {
    return NextResponse.json({ ok: true, dejaMarque: false });
  }

  // count === 0 : soit le chèque n'existe pas, soit numeroAlerte ne
  // correspond plus au compteur actuel (déjà marqué par un appel précédent,
  // ou appel hors ordre) — à distinguer pour ne pas masquer une erreur d'id
  // côté n8n derrière un faux "déjà envoyé".
  const cheque = await prisma.cheque.findUnique({
    where: { id: chequeId },
    select: { nombreAlertesEnvoyees: true },
  });
  if (!cheque) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    dejaMarque: true,
    nombreAlertesEnvoyees: cheque.nombreAlertesEnvoyees,
  });
}
