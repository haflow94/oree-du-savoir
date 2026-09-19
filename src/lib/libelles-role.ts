import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { ALL_ROLES, ROLE_LABELS, type Role } from "@/lib/roles";

// Une seule lecture par requête (mémoïsation `cache()` de React), même
// principe que chargerPermissions() dans lib/permissions.ts. Fusionne les
// libellés personnalisés (table libelles_role, éditée depuis Administration
// → Rôles) avec les valeurs par défaut de ROLE_LABELS — un rôle sans ligne
// en base retombe simplement sur son libellé par défaut.
export const libellesRoles = cache(async (): Promise<Record<Role, string>> => {
  const lignes = await prisma.libelleRole.findMany();
  const personnalises = new Map(lignes.map((l) => [l.role, l.libelle]));
  return Object.fromEntries(
    ALL_ROLES.map((role) => [role, personnalises.get(role) ?? ROLE_LABELS[role]]),
  ) as Record<Role, string>;
});
