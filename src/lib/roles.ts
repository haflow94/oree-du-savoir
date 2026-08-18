import type { Role } from "@/generated/prisma/enums";

export { Role } from "@/generated/prisma/enums";

export const ROLE_LABELS: Record<Role, string> = {
  BUREAU: "Bureau / Président",
  ADMINISTRATION: "Administration",
  ACCUEIL: "Accueil",
  TRESORIER: "Trésorier",
  ENSEIGNANT: "Enseignant",
};

export const ALL_ROLES: Role[] = [
  "BUREAU",
  "ADMINISTRATION",
  "ACCUEIL",
  "TRESORIER",
  "ENSEIGNANT",
];

// Comptes "staff" (Administration > Comptes) : les enseignants ont leur
// propre onglet (Administration > Enseignants), pour ne pas mélanger les
// deux populations dans la même liste.
export const ROLES_STAFF: Role[] = ["BUREAU", "ADMINISTRATION", "ACCUEIL", "TRESORIER"];

export function hasRole(userRole: Role, allowed: Role[]): boolean {
  return allowed.includes(userRole);
}
