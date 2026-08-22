import type { Role } from "@/generated/prisma/enums";

export { Role } from "@/generated/prisma/enums";

export const ROLE_LABELS: Record<Role, string> = {
  BUREAU: "Bureau / Président",
  ADMINISTRATION: "Administration",
  ACCUEIL: "Accueil",
  TRESORIER: "Trésorier",
  ENSEIGNANT: "Enseignant",
  ACTIVITE: "Responsable activités",
};

export const ALL_ROLES: Role[] = [
  "BUREAU",
  "ADMINISTRATION",
  "ACCUEIL",
  "TRESORIER",
  "ENSEIGNANT",
  "ACTIVITE",
];

// Comptes "staff" (Administration > Comptes) : les enseignants et les
// responsables d'activités ont chacun leur propre onglet (Administration >
// Enseignants / > Responsables d'activités), pour ne pas mélanger ces
// populations dans la même liste.
export const ROLES_STAFF: Role[] = ["BUREAU", "ADMINISTRATION", "ACCUEIL", "TRESORIER"];

export function hasRole(userRole: Role, allowed: Role[]): boolean {
  return allowed.includes(userRole);
}
