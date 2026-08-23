import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession, type SessionUser } from "@/lib/auth";
import { Role } from "@/lib/roles";
import { Module, NiveauAcces } from "@/generated/prisma/enums";
import { couvre } from "@/lib/niveau-acces";

export { Module, NiveauAcces };

export const MODULE_LABELS: Record<Module, string> = {
  ETUDIANTS: "Étudiants",
  CLASSES: "Classes",
  PRESENCES: "Présences",
  ACTIVITES: "Activités",
  PAIEMENTS: "Paiements",
  TRESORERIE: "Trésorerie",
  ADMINISTRATION: "Administration (sections, année scolaire)",
  DOCUMENTS: "Documents",
  INSCRIPTIONS: "Inscriptions",
  CALENDRIER: "Calendrier",
};

// Une seule lecture de toute la table par requête (mémoïsation `cache()` de
// React, scopée au rendu en cours). BUREAU n'y figure jamais : court-circuité
// dans niveauAcces() avant toute requête Prisma — voir le commentaire sur
// PermissionRole dans schema.prisma (élimine le risque de lock-out).
const chargerPermissions = cache(async (): Promise<Map<string, NiveauAcces>> => {
  const lignes = await prisma.permissionRole.findMany({
    where: { role: { not: Role.BUREAU } },
  });
  return new Map(lignes.map((l) => [`${l.role}:${l.module}`, l.niveau]));
});

export async function niveauAcces(role: Role, module: Module): Promise<NiveauAcces> {
  if (role === Role.BUREAU) return "ECRITURE";
  const permissions = await chargerPermissions();
  return permissions.get(`${role}:${module}`) ?? "AUCUN";
}

/** Variante non-redirigeante, pour les conditions d'affichage inline (boutons visibles/cachés). */
export async function peutAccederModule(
  role: Role,
  module: Module,
  niveauRequis: NiveauAcces = "LECTURE",
): Promise<boolean> {
  return couvre(await niveauAcces(role, module), niveauRequis);
}

// Remplace requireRole([...]) pour tout ce qui est piloté par la grille de
// permissions. Même ergonomie : redirige /login si personne n'est connecté,
// /acces-refuse si le niveau est insuffisant (sans révéler la nature de la
// page bloquée), et supporte allowedSeanceId pour les sessions restreintes
// au QR (voir requireSession dans lib/auth.ts).
export async function requireModule(
  module: Module,
  niveauRequis: NiveauAcces = "LECTURE",
  options?: { allowedSeanceId?: string },
): Promise<SessionUser> {
  const session = await requireSession(options);
  if (!(await peutAccederModule(session.role, module, niveauRequis))) {
    redirect("/acces-refuse");
  }
  return session;
}
