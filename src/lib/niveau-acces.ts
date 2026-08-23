// Logique pure (pas de Prisma) — reste importable depuis un test ou un
// composant client. La lecture en base vit dans lib/permissions.ts, qui
// réutilise cette comparaison.
import { NiveauAcces } from "@/generated/prisma/enums";

const ORDRE: Record<NiveauAcces, number> = { AUCUN: 0, LECTURE: 1, ECRITURE: 2 };

/** `niveau` satisfait-il au moins `niveauRequis` (ECRITURE couvre LECTURE) ? */
export function couvre(niveau: NiveauAcces, niveauRequis: NiveauAcces): boolean {
  return ORDRE[niveau] >= ORDRE[niveauRequis];
}
