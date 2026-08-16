import type { Role } from "@/generated/prisma/client";

export { Role } from "@/generated/prisma/client";

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

export function hasRole(userRole: Role, allowed: Role[]): boolean {
  return allowed.includes(userRole);
}
