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
} from "../actions";
import { LONGUEUR_MIN_MOT_DE_PASSE } from "@/lib/comptes";

const MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Tous les champs obligatoires doivent être renseignés.",
  MOT_DE_PASSE_TROP_COURT: `Le mot de passe doit faire au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`,
  EMAIL_DEJA_UTILISE: "Un compte utilise déjà cette adresse email.",
  INTROUVABLE: "Ce compte n'existe plus.",
};

export default async function EnseignantsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireRole([Role.BUREAU]);
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const enseignants = await prisma.utilisateur.findMany({
    where: { role: Role.ENSEIGNANT },
    orderBy: [{ actif: "desc" }, { nom: "asc" }],
    include: {
      _count: { select: { sessions: true, classesEnseignees: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/administration" className="text-sm text-slate-500 hover:underline">
          ← Administration
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Enseignants</h2>
        <p className="text-sm text-slate-500">
          Comptes enseignants, séparés du staff (Bureau, Administration,
          Accueil, Trésorier) géré depuis Administration → Comptes.
        </p>
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

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          Créer un compte enseignant
        </h3>
        <form action={creerUtilisateurAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="from" value="/administration/enseignants" />
          <input type="hidden" name="role" value={Role.ENSEIGNANT} />
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
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

      <div className="space-y-3">
        {enseignants.map((u) => (
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
                </div>
                <div className="text-sm text-slate-500">{u.email}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {u._count.classesEnseignees} classe(s) ·{" "}
                  {u.dernierLogin
                    ? `Dernière connexion : ${new Date(u.dernierLogin).toLocaleString("fr-FR")}`
                    : "Jamais connecté"}
                  {u._count.sessions > 0 && ` · ${u._count.sessions} session(s) active(s)`}
                </div>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  u.actif ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                }`}
              >
                {u.actif ? "Actif" : "Désactivé"}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-slate-100 pt-4">
              <form action={changerRoleAction} className="flex items-end gap-2">
                <input type="hidden" name="from" value="/administration/enseignants" />
                <input type="hidden" name="utilisateurId" value={u.id} />
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Faire passer vers le staff
                  </label>
                  <select
                    name="role"
                    defaultValue=""
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  >
                    <option value="" disabled>
                      Choisir un rôle…
                    </option>
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
                <input type="hidden" name="from" value="/administration/enseignants" />
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
                  <input type="hidden" name="from" value="/administration/enseignants" />
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
                <input type="hidden" name="from" value="/administration/enseignants" />
                <input type="hidden" name="utilisateurId" value={u.id} />
                <input type="hidden" name="activer" value={u.actif ? "0" : "1"} />
                <button
                  type="submit"
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
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
        ))}
        {enseignants.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
            Aucun compte enseignant pour l&apos;instant.
          </p>
        )}
      </div>
    </div>
  );
}
