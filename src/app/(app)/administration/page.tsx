import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, ROLE_LABELS, ROLES_STAFF } from "@/lib/roles";
import {
  creerUtilisateurAction,
  changerActivationAction,
  changerRoleAction,
  reinitialiserMotDePasseAction,
  revoquerSessionsAction,
} from "./actions";
import { LONGUEUR_MIN_MOT_DE_PASSE } from "@/lib/comptes";

const MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Tous les champs obligatoires doivent être renseignés.",
  MOT_DE_PASSE_TROP_COURT: `Le mot de passe doit faire au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`,
  EMAIL_DEJA_UTILISE: "Un compte utilise déjà cette adresse email.",
  INTROUVABLE: "Ce compte n'existe plus.",
  AUTO_DESACTIVATION: "Vous ne pouvez pas désactiver votre propre compte.",
  DERNIER_BUREAU:
    "Impossible : ce compte est le dernier Bureau actif. Sans lui, plus personne ne pourrait gérer les comptes.",
};

export default async function AdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  // Double vérification : le lien est déjà masqué pour les autres rôles
  // dans la barre latérale, mais l'accès direct à l'URL doit aussi être
  // bloqué ici (défense en profondeur).
  const session = await requireRole([Role.BUREAU, Role.ADMINISTRATION]);
  const estBureau = session.role === Role.BUREAU;
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  // Les enseignants ont leur propre onglet (Administration > Enseignants) :
  // exclus ici pour ne pas mélanger les deux populations de comptes.
  const utilisateurs = estBureau
    ? await prisma.utilisateur.findMany({
        where: { role: { in: ROLES_STAFF } },
        orderBy: [{ actif: "desc" }, { nom: "asc" }],
        include: { _count: { select: { sessions: true } } },
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Administration</h2>
          <p className="text-sm text-slate-500">
            {estBureau
              ? "Comptes, rôles, activation et révocation."
              : "Référentiels : sections, année scolaire."}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/administration/sections"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sections
          </Link>
          <Link
            href="/administration/annees-scolaires"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Année scolaire
          </Link>
          {estBureau && (
            <Link
              href="/administration/enseignants"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Enseignants
            </Link>
          )}
          {estBureau && (
            <Link
              href="/administration/journal"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Journal d&apos;audit
            </Link>
          )}
        </div>
      </div>

      {message && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      )}
      {ok && !message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Modification enregistrée.
        </p>
      )}

      {estBureau && (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          Créer un compte
        </h3>
        <form action={creerUtilisateurAction} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="prenom" className="mb-1 block text-xs font-medium text-slate-600">
              Prénom
            </label>
            <input
              id="prenom"
              name="prenom"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label htmlFor="nom" className="mb-1 block text-xs font-medium text-slate-600">
              Nom
            </label>
            <input
              id="nom"
              name="nom"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-600">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label htmlFor="role" className="mb-1 block text-xs font-medium text-slate-600">
              Rôle
            </label>
            <select
              id="role"
              name="role"
              required
              defaultValue={Role.ACCUEIL}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              {ROLES_STAFF.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="motDePasse" className="mb-1 block text-xs font-medium text-slate-600">
              Mot de passe initial ({LONGUEUR_MIN_MOT_DE_PASSE} caractères minimum)
            </label>
            <input
              id="motDePasse"
              name="motDePasse"
              type="password"
              required
              minLength={LONGUEUR_MIN_MOT_DE_PASSE}
              autoComplete="new-password"
              className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              À communiquer à la personne concernée, qui devra le changer.
            </p>
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Créer le compte
            </button>
          </div>
        </form>
      </div>
      )}

      {estBureau && (
      <div className="space-y-3">
        {utilisateurs.map((u) => {
          const soiMeme = u.id === session.id;
          return (
            <div
              key={u.id}
              className={`rounded-xl border bg-white p-5 shadow-sm ${
                u.actif ? "border-slate-200" : "border-slate-200 opacity-75"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-800">
                    {u.prenom} {u.nom}
                    {soiMeme && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        vous
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-500">{u.email}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {u.dernierLogin
                      ? `Dernière connexion : ${new Date(u.dernierLogin).toLocaleString("fr-FR")}`
                      : "Jamais connecté"}
                    {u._count.sessions > 0 && ` · ${u._count.sessions} session(s) active(s)`}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    u.actif
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {u.actif ? "Actif" : "Désactivé"}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-slate-100 pt-4">
                <form action={changerRoleAction} className="flex items-end gap-2">
                  <input type="hidden" name="utilisateurId" value={u.id} />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Rôle
                    </label>
                    <select
                      name="role"
                      defaultValue={u.role}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    >
                      {ROLES_STAFF.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Changer
                  </button>
                </form>

                <form action={reinitialiserMotDePasseAction} className="flex items-end gap-2">
                  <input type="hidden" name="utilisateurId" value={u.id} />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Nouveau mot de passe
                    </label>
                    <input
                      type="password"
                      name="motDePasse"
                      required
                      minLength={LONGUEUR_MIN_MOT_DE_PASSE}
                      autoComplete="new-password"
                      className="w-44 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Réinitialiser
                  </button>
                </form>

                {u._count.sessions > 0 && (
                  <form action={revoquerSessionsAction}>
                    <input type="hidden" name="utilisateurId" value={u.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Révoquer les sessions
                    </button>
                  </form>
                )}

                <form action={changerActivationAction}>
                  <input type="hidden" name="utilisateurId" value={u.id} />
                  <input type="hidden" name="activer" value={u.actif ? "0" : "1"} />
                  <button
                    type="submit"
                    disabled={soiMeme && u.actif}
                    title={
                      soiMeme && u.actif
                        ? "Vous ne pouvez pas désactiver votre propre compte"
                        : undefined
                    }
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                      u.actif
                        ? "border-red-300 text-red-700 hover:bg-red-50"
                        : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    {u.actif ? "Désactiver" : "Réactiver"}
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
