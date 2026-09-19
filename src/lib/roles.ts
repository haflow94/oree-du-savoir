import type { Role } from "@/generated/prisma/enums";

export { Role } from "@/generated/prisma/enums";

// Libellés par défaut, utilisés tant qu'aucune ligne LibelleRole ne les
// remplace (voir lib/libelles-role.ts pour la version fusionnée avec la
// base, éditable depuis Administration → Rôles).
export const ROLE_LABELS: Record<Role, string> = {
  BUREAU: "Bureau",
  ADMINISTRATION: "Administration",
  ACCUEIL: "Accueil",
  ENSEIGNANT: "Enseignant",
  ACTIVITE: "Responsable activités",
};

export const ALL_ROLES: Role[] = ["BUREAU", "ADMINISTRATION", "ACCUEIL", "ENSEIGNANT", "ACTIVITE"];

// Comptes "staff" (Administration > Comptes) : les enseignants et les
// responsables d'activités ont chacun leur propre onglet (Administration >
// Enseignants / > Responsables d'activités), pour ne pas mélanger ces
// populations dans la même liste. Le Trésorier a fusionné dans Bureau
// (mêmes droits depuis toujours, voir migration
// 20260919130000_supprime_tresorier_ajoute_libelles_role) : ce n'est plus un
// rôle séparé.
export const ROLES_STAFF: Role[] = ["BUREAU", "ADMINISTRATION", "ACCUEIL"];

export function hasRole(userRole: Role, allowed: Role[]): boolean {
  return allowed.includes(userRole);
}
