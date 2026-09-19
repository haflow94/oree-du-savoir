"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, ALL_ROLES, ROLE_LABELS } from "@/lib/roles";

function champLibelle(role: Role): string {
  return `libelle__${role}`;
}

function retour(erreur?: string): never {
  redirect(erreur ? `/administration/roles?error=${erreur}` : "/administration/roles?ok=1");
}

// Un libellé ramené à sa valeur par défaut (ROLE_LABELS) efface la ligne
// plutôt que de la garder identique en base — même logique que la grille de
// permissions, qui ne stocke que ce qui diffère du fallback.
export async function enregistrerLibellesRoleAction(formData: FormData): Promise<void> {
  const session = await requireRole([Role.BUREAU]);

  const demandes = new Map<Role, string>();
  for (const role of ALL_ROLES) {
    const valeur = formData.get(champLibelle(role));
    const nettoye = typeof valeur === "string" ? valeur.trim() : "";
    if (nettoye.length === 0) {
      retour("CHAMPS_INVALIDES");
    }
    demandes.set(role, nettoye);
  }

  const actuelles = await prisma.libelleRole.findMany();
  const actuellesParRole = new Map(actuelles.map((l) => [l.role, l.libelle]));

  const aSupprimer: Role[] = [];
  const aEcrire: { role: Role; libelle: string }[] = [];
  const modifications: { role: Role; avant: string; apres: string }[] = [];

  for (const role of ALL_ROLES) {
    const demande = demandes.get(role)!;
    const avant = actuellesParRole.get(role) ?? ROLE_LABELS[role];
    if (demande === avant) continue;

    modifications.push({ role, avant, apres: demande });
    if (demande === ROLE_LABELS[role]) {
      aSupprimer.push(role);
    } else {
      aEcrire.push({ role, libelle: demande });
    }
  }

  if (modifications.length === 0) {
    retour();
  }

  await prisma.$transaction([
    ...(aSupprimer.length > 0 ? [prisma.libelleRole.deleteMany({ where: { role: { in: aSupprimer } } })] : []),
    ...aEcrire.map(({ role, libelle }) =>
      prisma.libelleRole.upsert({
        where: { role },
        update: { libelle },
        create: { role, libelle },
      }),
    ),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_libelles_role",
        entite: "LibelleRole",
        entiteId: "grille",
        details: { modifications },
      },
    }),
  ]);

  revalidatePath("/administration/roles");
  revalidatePath("/administration");
  revalidatePath("/administration/enseignants");
  revalidatePath("/administration/activites");
  revalidatePath("/administration/permissions");
  retour();
}
