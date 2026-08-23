"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, ALL_ROLES } from "@/lib/roles";
import { Module, NiveauAcces } from "@/lib/permissions";

const NIVEAUX_VALIDES = new Set(Object.values(NiveauAcces));

function champNom(role: Role, mod: Module): string {
  return `${role}__${mod}`;
}

function retour(erreur?: string): never {
  redirect(
    erreur
      ? `/administration/permissions?error=${erreur}`
      : "/administration/permissions?ok=1",
  );
}

// La ligne BUREAU n'est jamais éditable (voir lib/permissions.ts : ce rôle
// est court-circuité en ECRITURE, jamais lu en base) — on ne la traite donc
// jamais ici, même si un champ portant ce nom était injecté dans le formulaire.
export async function enregistrerPermissionsAction(formData: FormData): Promise<void> {
  const session = await requireRole([Role.BUREAU]);

  const rolesEditables = ALL_ROLES.filter((role) => role !== Role.BUREAU);
  const modules = Object.values(Module);

  const demandees = new Map<string, NiveauAcces>();
  for (const role of rolesEditables) {
    for (const mod of modules) {
      const valeur = formData.get(champNom(role, mod));
      if (typeof valeur !== "string" || !NIVEAUX_VALIDES.has(valeur as NiveauAcces)) {
        retour("CHAMPS_INVALIDES");
      }
      demandees.set(champNom(role, mod), valeur as NiveauAcces);
    }
  }

  const actuelles = await prisma.permissionRole.findMany({
    where: { role: { in: rolesEditables } },
  });
  const actuellesParCle = new Map(
    actuelles.map((l) => [champNom(l.role as Role, l.module as Module), l.niveau]),
  );

  const modifications: { role: Role; module: Module; avant: NiveauAcces; apres: NiveauAcces }[] = [];
  for (const role of rolesEditables) {
    for (const mod of modules) {
      const cle = champNom(role, mod);
      const apres = demandees.get(cle)!;
      const avant = actuellesParCle.get(cle) ?? NiveauAcces.AUCUN;
      if (avant !== apres) {
        modifications.push({ role, module: mod, avant, apres });
      }
    }
  }

  if (modifications.length === 0) {
    retour();
  }

  await prisma.$transaction([
    ...modifications.map(({ role, module: mod, apres }) =>
      prisma.permissionRole.upsert({
        where: { role_module: { role, module: mod } },
        update: { niveau: apres },
        create: { role, module: mod, niveau: apres },
      }),
    ),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_permissions",
        entite: "PermissionRole",
        entiteId: "grille",
        details: { modifications },
      },
    }),
  ]);

  revalidatePath("/administration/permissions");
  retour();
}
