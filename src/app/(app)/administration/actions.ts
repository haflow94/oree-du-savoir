"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { LONGUEUR_MIN_MOT_DE_PASSE } from "@/lib/comptes";

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

function estRole(valeur: string | null): valeur is Role {
  return valeur !== null && valeur in Role;
}

// Ces actions sont partagées entre Administration > Comptes et
// Administration > Enseignants : le champ caché "from" ramène vers la page
// d'où l'action a été déclenchée plutôt que de toujours revenir sur la
// première (voir administration/page.tsx et enseignants/page.tsx).
function retour(formData: FormData, erreur?: string): never {
  const base = champTexte(formData, "from") ?? "/administration";
  redirect(erreur ? `${base}?error=${erreur}` : `${base}?ok=1`);
}

/**
 * Nombre de comptes Bureau actifs restants si l'on retirait `exclureId` du
 * lot. Sert à empêcher la suppression du dernier accès administrateur :
 * plus aucun Bureau actif = plus personne pour gérer les comptes.
 */
async function bureauxActifsSauf(exclureId: string): Promise<number> {
  return prisma.utilisateur.count({
    where: { role: Role.BUREAU, actif: true, id: { not: exclureId } },
  });
}

export async function creerUtilisateurAction(formData: FormData): Promise<void> {
  const session = await requireRole([Role.BUREAU]);

  const email = champTexte(formData, "email")?.toLowerCase();
  const nom = champTexte(formData, "nom");
  const prenom = champTexte(formData, "prenom");
  const role = champTexte(formData, "role");
  const motDePasse = formData.get("motDePasse");

  if (!email || !nom || !prenom || !estRole(role)) {
    retour(formData, "CHAMPS_MANQUANTS");
  }
  if (typeof motDePasse !== "string" || motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    retour(formData, "MOT_DE_PASSE_TROP_COURT");
  }

  const existant = await prisma.utilisateur.findUnique({ where: { email } });
  if (existant) {
    retour(formData, "EMAIL_DEJA_UTILISE");
  }

  const cree = await prisma.utilisateur.create({
    data: {
      email,
      nom,
      prenom,
      role,
      motDePasseHash: await hashPassword(motDePasse),
    },
  });

  await prisma.journalAudit.create({
    data: {
      utilisateurId: session.id,
      action: "creation_compte",
      entite: "Utilisateur",
      entiteId: cree.id,
      details: { email, role },
    },
  });

  revalidatePath("/administration");
  revalidatePath("/administration/enseignants");
  retour(formData);
}

export async function changerActivationAction(formData: FormData): Promise<void> {
  const session = await requireRole([Role.BUREAU]);

  const utilisateurId = champTexte(formData, "utilisateurId");
  const activer = formData.get("activer") === "1";
  if (!utilisateurId) retour(formData, "CHAMPS_MANQUANTS");

  const cible = await prisma.utilisateur.findUnique({ where: { id: utilisateurId } });
  if (!cible) retour(formData, "INTROUVABLE");

  if (!activer) {
    if (cible.id === session.id) {
      retour(formData, "AUTO_DESACTIVATION");
    }
    if (cible.role === Role.BUREAU && (await bureauxActifsSauf(cible.id)) === 0) {
      retour(formData, "DERNIER_BUREAU");
    }
  }

  // Désactiver révoque immédiatement les sessions en cours : sans cela, la
  // personne resterait connectée jusqu'à l'expiration de son cookie.
  await prisma.$transaction([
    prisma.utilisateur.update({
      where: { id: utilisateurId },
      data: { actif: activer },
    }),
    ...(activer ? [] : [prisma.session.deleteMany({ where: { utilisateurId } })]),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: activer ? "activation_compte" : "desactivation_compte",
        entite: "Utilisateur",
        entiteId: utilisateurId,
      },
    }),
  ]);

  revalidatePath("/administration");
  revalidatePath("/administration/enseignants");
  retour(formData);
}

export async function changerRoleAction(formData: FormData): Promise<void> {
  const session = await requireRole([Role.BUREAU]);

  const utilisateurId = champTexte(formData, "utilisateurId");
  const role = champTexte(formData, "role");
  if (!utilisateurId || !estRole(role)) retour(formData, "CHAMPS_MANQUANTS");

  const cible = await prisma.utilisateur.findUnique({ where: { id: utilisateurId } });
  if (!cible) retour(formData, "INTROUVABLE");
  if (cible.role === role) retour(formData);

  // Retirer le rôle Bureau au dernier Bureau actif condamnerait l'accès à
  // cette page pour tout le monde.
  if (
    cible.role === Role.BUREAU &&
    cible.actif &&
    (await bureauxActifsSauf(cible.id)) === 0
  ) {
    retour(formData, "DERNIER_BUREAU");
  }

  await prisma.$transaction([
    prisma.utilisateur.update({ where: { id: utilisateurId }, data: { role } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "changement_role",
        entite: "Utilisateur",
        entiteId: utilisateurId,
        details: { avant: cible.role, apres: role },
      },
    }),
  ]);

  revalidatePath("/administration");
  revalidatePath("/administration/enseignants");
  retour(formData);
}

export async function reinitialiserMotDePasseAction(
  formData: FormData,
): Promise<void> {
  const session = await requireRole([Role.BUREAU]);

  const utilisateurId = champTexte(formData, "utilisateurId");
  const motDePasse = formData.get("motDePasse");
  if (!utilisateurId) retour(formData, "CHAMPS_MANQUANTS");
  if (typeof motDePasse !== "string" || motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    retour(formData, "MOT_DE_PASSE_TROP_COURT");
  }

  // Changer le mot de passe déconnecte partout : une session ouverte avec
  // l'ancien mot de passe ne doit pas survivre à sa réinitialisation.
  await prisma.$transaction([
    prisma.utilisateur.update({
      where: { id: utilisateurId },
      data: { motDePasseHash: await hashPassword(motDePasse) },
    }),
    prisma.session.deleteMany({ where: { utilisateurId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "reinitialisation_mot_de_passe",
        entite: "Utilisateur",
        entiteId: utilisateurId,
      },
    }),
  ]);

  revalidatePath("/administration");
  revalidatePath("/administration/enseignants");
  retour(formData);
}

export async function revoquerSessionsAction(formData: FormData): Promise<void> {
  const session = await requireRole([Role.BUREAU]);

  const utilisateurId = champTexte(formData, "utilisateurId");
  if (!utilisateurId) retour(formData, "CHAMPS_MANQUANTS");

  await prisma.$transaction([
    prisma.session.deleteMany({ where: { utilisateurId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "revocation_sessions",
        entite: "Utilisateur",
        entiteId: utilisateurId,
      },
    }),
  ]);

  revalidatePath("/administration");
  revalidatePath("/administration/enseignants");
  retour(formData);
}
