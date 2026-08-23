import "server-only";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { peutAccederModule, Module } from "@/lib/permissions";
import type { SessionUser } from "@/lib/auth";

/**
 * Rôles qui peuvent corriger une présence sans limite de temps, annuler une
 * séance ou gérer les fermetures — volontairement plus étroit que le niveau
 * Écriture du module Présences dans la grille de permissions (qui inclut
 * aussi Accueil/Trésorier/Enseignant) : ces actions restent un carve-out
 * Bureau/Administration littéral, voir presences/actions.ts.
 */
export function estAdministratif(role: SessionUser["role"]): boolean {
  return role === Role.BUREAU || role === Role.ADMINISTRATION;
}

/**
 * Un enseignant n'accède qu'aux classes qui lui sont assignées (scoping par
 * ClasseEnseignant) ; tout autre rôle avec Écriture sur le module Présences
 * dans la grille de permissions (Bureau, Administration, Accueil, Trésorier)
 * accède à toutes les classes.
 */
export async function peutAccederClasse(
  session: SessionUser,
  classeId: string,
): Promise<boolean> {
  if (session.role === Role.ENSEIGNANT) {
    const lien = await prisma.classeEnseignant.findUnique({
      where: {
        classeId_utilisateurId: { classeId, utilisateurId: session.id },
      },
    });
    return lien !== null;
  }

  return peutAccederModule(session.role, Module.PRESENCES, "ECRITURE");
}
