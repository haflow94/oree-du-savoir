import "server-only";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import type { SessionUser } from "@/lib/auth";

/**
 * Rôles qui peuvent corriger une présence sans limite de temps
 * (décision validée : « enseignant limité, administration toujours »).
 */
export function estAdministratif(role: SessionUser["role"]): boolean {
  return role === Role.BUREAU || role === Role.ADMINISTRATION;
}

/**
 * Un enseignant n'accède qu'aux classes qui lui sont assignées ; les rôles
 * administratifs voient tout. Accueil et Trésorier n'ont rien à faire dans
 * les présences.
 */
export async function peutAccederClasse(
  session: SessionUser,
  classeId: string,
): Promise<boolean> {
  if (estAdministratif(session.role)) return true;
  if (session.role !== Role.ENSEIGNANT) return false;

  const lien = await prisma.classeEnseignant.findUnique({
    where: {
      classeId_utilisateurId: { classeId, utilisateurId: session.id },
    },
  });
  return lien !== null;
}
