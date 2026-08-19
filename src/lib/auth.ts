import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  SESSION_COOKIE_NAME,
  generateSessionToken,
  hashSessionToken,
  sessionExpiryDate,
  isExpired,
} from "@/lib/session-token";
import { hasRole, type Role } from "@/lib/roles";
import type { Utilisateur } from "@/generated/prisma/client";

export type SessionUser = Pick<
  Utilisateur,
  "id" | "email" | "nom" | "prenom" | "role" | "actif"
> & {
  // Connexion faite en scannant le QR d'une classe : non-null tant que
  // cette session ne doit accéder qu'à la feuille de présence de cette
  // séance-là, rien d'autre (voir requireSession ci-dessous).
  seanceRestreinteId: string | null;
};

type LoginResult =
  | { ok: true }
  | { ok: false; error: "IDENTIFIANTS_INVALIDES" | "COMPTE_DESACTIVE" };

export { hashPassword };

export async function login(
  email: string,
  motDePasse: string,
  seanceRestreinteId: string | null = null,
): Promise<LoginResult> {
  const utilisateur = await prisma.utilisateur.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  // Réponse volontairement identique (compte inconnu vs mot de passe faux)
  // pour ne pas révéler quels emails existent.
  if (!utilisateur) {
    return { ok: false, error: "IDENTIFIANTS_INVALIDES" };
  }

  const motDePasseValide = await verifyPassword(
    motDePasse,
    utilisateur.motDePasseHash,
  );
  if (!motDePasseValide) {
    return { ok: false, error: "IDENTIFIANTS_INVALIDES" };
  }

  if (!utilisateur.actif) {
    return { ok: false, error: "COMPTE_DESACTIVE" };
  }

  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expireLe = sessionExpiryDate();

  await prisma.$transaction([
    prisma.session.create({
      data: { tokenHash, utilisateurId: utilisateur.id, expireLe, seanceRestreinteId },
    }),
    prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: { dernierLogin: new Date() },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: utilisateur.id,
        action: "connexion",
        entite: "Utilisateur",
        entiteId: utilisateur.id,
      },
    }),
  ]);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expireLe,
  });

  return { ok: true };
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  cookieStore.delete(SESSION_COOKIE_NAME);

  if (!token) return;

  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({ where: { tokenHash } });
  if (!session) return;

  await prisma.$transaction([
    prisma.session.delete({ where: { id: session.id } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.utilisateurId,
        action: "deconnexion",
        entite: "Utilisateur",
        entiteId: session.utilisateurId,
      },
    }),
  ]);
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { utilisateur: true },
  });

  if (!session || isExpired(session.expireLe) || !session.utilisateur.actif) {
    return null;
  }

  const { id, email, nom, prenom, role, actif } = session.utilisateur;
  return { id, email, nom, prenom, role, actif, seanceRestreinteId: session.seanceRestreinteId };
}

// Garde d'accès pour les Server Components protégés : redirige vers /login
// si personne n'est connecté, ou vers /acces-refuse si le rôle ne convient
// pas. Utilisée dans les layouts/pages, pas dans le proxy Edge (qui ne
// peut pas interroger Postgres) — voir proxy.ts pour le détail.
//
// `allowedSeanceId` : seul point d'entrée pour une session restreinte au QR
// (voir SessionUser). Toute page/action qui ne fournit pas l'id de LA séance
// autorisée — donc la quasi-totalité de l'appli — renvoie une session
// restreinte vers /appel/{id} (feuille isolée, hors du layout applicatif :
// jamais de menu, quel que soit le rôle), même si l'URL tapée à la main
// mènerait normalement à une page que son rôle autoriserait.
export async function requireSession(options?: {
  allowedSeanceId?: string;
}): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (
    session.seanceRestreinteId &&
    session.seanceRestreinteId !== options?.allowedSeanceId
  ) {
    redirect(`/appel/${session.seanceRestreinteId}`);
  }
  return session;
}

export async function requireRole(
  allowed: Role[],
  options?: { allowedSeanceId?: string },
): Promise<SessionUser> {
  const session = await requireSession(options);
  if (!hasRole(session.role, allowed)) {
    redirect("/acces-refuse");
  }
  return session;
}
