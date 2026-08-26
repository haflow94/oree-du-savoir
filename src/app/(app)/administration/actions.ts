"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { LONGUEUR_MIN_MOT_DE_PASSE } from "@/lib/comptes";
import { estEmailValide } from "@/lib/champs-formulaire";

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

function estRole(valeur: string | null): valeur is Role {
  return valeur !== null && valeur in Role;
}

// Ids de sections cochées comme spécialités (checkboxes "specialites"),
// dédupliqués. Champ optionnel : un enseignant sans spécialité déclarée
// reste proposé pour toutes les sections (voir lib/enseignants-section.ts).
function specialitesChoisies(formData: FormData): string[] {
  return [...new Set(formData.getAll("specialites").filter((v): v is string => typeof v === "string"))];
}

// Ces actions sont partagées entre Administration > Comptes et
// Administration > Enseignants : le champ caché "from" ramène vers la page
// d'où l'action a été déclenchée plutôt que de toujours revenir sur la
// première (voir administration/page.tsx et enseignants/page.tsx).
// "utilisateurId", quand présent dans le formulaire, est aussi répercuté
// dans l'URL de retour : les actions par compte (changerRoleAction,
// reinitialiserMotDePasseAction, ...) sont déclenchées depuis une pastille
// modale par compte (voir utilisateur-row.tsx) — ce paramètre permet à la
// page de rouvrir la bonne pastille après une erreur, plutôt que de laisser
// le message d'erreur s'afficher sans le formulaire concerné sous les yeux.
// Absent, l'erreur ne peut venir que de creerUtilisateurAction.
function retour(formData: FormData, erreur?: string): never {
  const base = champTexte(formData, "from") ?? "/administration";
  const utilisateurId = champTexte(formData, "utilisateurId");
  const params = new URLSearchParams();
  params.set(erreur ? "error" : "ok", erreur ?? "1");
  if (utilisateurId) params.set("utilisateurId", utilisateurId);
  redirect(`${base}?${params.toString()}`);
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
  if (!estEmailValide(email)) {
    retour(formData, "EMAIL_INVALIDE");
  }
  if (typeof motDePasse !== "string" || motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    retour(formData, "MOT_DE_PASSE_TROP_COURT");
  }

  const existant = await prisma.utilisateur.findUnique({ where: { email } });
  if (existant) {
    retour(formData, "EMAIL_DEJA_UTILISE");
  }

  const specialites = role === Role.ENSEIGNANT ? specialitesChoisies(formData) : [];

  const cree = await prisma.utilisateur.create({
    data: {
      email,
      nom,
      prenom,
      role,
      motDePasseHash: await hashPassword(motDePasse),
      ...(specialites.length > 0 ? { specialites: { connect: specialites.map((id) => ({ id })) } } : {}),
    },
  });

  await prisma.journalAudit.create({
    data: {
      utilisateurId: session.id,
      action: "creation_compte",
      entite: "Utilisateur",
      entiteId: cree.id,
      details: { email, role, specialites },
    },
  });

  revalidatePath("/administration");
  revalidatePath("/administration/enseignants");
  revalidatePath("/administration/activites");
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
  revalidatePath("/administration/activites");
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
  revalidatePath("/administration/activites");
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
  revalidatePath("/administration/activites");
  retour(formData);
}

// Réservée aux comptes Enseignant (voir enseignants/page.tsx) : les autres
// rôles n'ont pas de spécialité, le concept n'a de sens que pour filtrer les
// enseignants proposés à l'affectation d'une classe (lib/enseignants.ts).
export async function changerSpecialitesAction(formData: FormData): Promise<void> {
  const session = await requireRole([Role.BUREAU]);

  const utilisateurId = champTexte(formData, "utilisateurId");
  if (!utilisateurId) retour(formData, "CHAMPS_MANQUANTS");

  const cible = await prisma.utilisateur.findUnique({ where: { id: utilisateurId } });
  if (!cible) retour(formData, "INTROUVABLE");
  if (cible.role !== Role.ENSEIGNANT) retour(formData, "CHAMPS_MANQUANTS");

  const specialites = specialitesChoisies(formData);

  await prisma.$transaction([
    prisma.utilisateur.update({
      where: { id: utilisateurId },
      data: { specialites: { set: specialites.map((id) => ({ id })) } },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "changement_specialites",
        entite: "Utilisateur",
        entiteId: utilisateurId,
        details: { specialites },
      },
    }),
  ]);

  revalidatePath("/administration/enseignants");
  revalidatePath("/classes/nouveau");
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
  revalidatePath("/administration/activites");
  retour(formData);
}
