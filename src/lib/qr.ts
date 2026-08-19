import "server-only";
import { prisma } from "@/lib/prisma";
import { aujourdhuiUTC } from "@/lib/presences";

export type SeanceDuJour =
  | { trouvee: true; classeId: string; seanceId: string }
  | { trouvee: false; raison: "TOKEN_INCONNU" | "PAS_DE_SEANCE" };

// Résout le token affiché en salle vers la séance du jour de la classe
// correspondante — utilisé à la fois par /qr/[token] (accès direct si déjà
// connecté) et par la connexion déclenchée depuis ce même QR (voir
// src/app/login/actions.ts), pour que la session créée soit restreinte à
// cette séance précise dès sa création.
export async function resoudreSeanceDuJourPourToken(
  token: string,
): Promise<SeanceDuJour> {
  const classe = await prisma.classe.findUnique({ where: { qrToken: token } });
  if (!classe) {
    return { trouvee: false, raison: "TOKEN_INCONNU" };
  }

  const seance = await prisma.seance.findUnique({
    where: { classeId_date: { classeId: classe.id, date: aujourdhuiUTC() } },
  });
  if (!seance) {
    return { trouvee: false, raison: "PAS_DE_SEANCE" };
  }

  return { trouvee: true, classeId: classe.id, seanceId: seance.id };
}
