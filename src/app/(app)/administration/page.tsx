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
import { Card, CardTitle } from "@/components/ui/card";
import { Champ, ChampSelect } from "@/components/ui/champ";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";

const CONTROL_SM_CLASSES =
  "rounded-md border border-border-strong bg-bg-elevated px-2 py-1.5 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";
const LABEL_XS_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

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
          <h1 className="font-display text-2xl font-semibold text-pine-strong">Administration</h1>
          <p className="text-sm text-ink-muted">
            {estBureau
              ? "Comptes, rôles, activation et révocation."
              : "Référentiels : sections, année scolaire."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/administration/sections" className={buttonVariants({ variant: "secondary" })}>
            Sections
          </Link>
          <Link
            href="/administration/annees-scolaires"
            className={buttonVariants({ variant: "secondary" })}
          >
            Année scolaire
          </Link>
          {estBureau && (
            <Link
              href="/administration/enseignants"
              className={buttonVariants({ variant: "secondary" })}
            >
              Enseignants
            </Link>
          )}
          {estBureau && (
            <Link href="/administration/journal" className={buttonVariants({ variant: "secondary" })}>
              Journal d&apos;audit
            </Link>
          )}
        </div>
      </div>

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      {estBureau && (
        <Card>
          <CardTitle>Créer un compte</CardTitle>
          <form action={creerUtilisateurAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <Champ label="Prénom" name="prenom" required />
            <Champ label="Nom" name="nom" required />
            <Champ label="Email" name="email" type="email" required autoComplete="off" />
            <ChampSelect label="Rôle" name="role" required defaultValue={Role.ACCUEIL}>
              {ROLES_STAFF.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </ChampSelect>
            <Champ
              label={`Mot de passe initial (${LONGUEUR_MIN_MOT_DE_PASSE} caractères minimum)`}
              name="motDePasse"
              type="password"
              required
              minLength={LONGUEUR_MIN_MOT_DE_PASSE}
              autoComplete="new-password"
              hint="À communiquer à la personne concernée, qui devra le changer."
              className="sm:col-span-2 max-w-sm"
            />
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" variant="primary">
                Créer le compte
              </Button>
            </div>
          </form>
        </Card>
      )}

      {estBureau && (
        <div className="space-y-3">
          {utilisateurs.map((u) => {
            const soiMeme = u.id === session.id;
            return (
              <Card key={u.id} className={u.actif ? "" : "opacity-75"}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-ink">
                      {u.prenom} {u.nom}
                      {soiMeme && (
                        <span className="ml-2">
                          <Badge variant="neutral">vous</Badge>
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-ink-muted">{u.email}</div>
                    <div className="mt-1 text-xs text-ink-faint">
                      {u.dernierLogin
                        ? `Dernière connexion : ${new Date(u.dernierLogin).toLocaleString("fr-FR")}`
                        : "Jamais connecté"}
                      {u._count.sessions > 0 && ` · ${u._count.sessions} session(s) active(s)`}
                    </div>
                  </div>
                  <Badge variant={u.actif ? "success" : "danger"}>
                    {u.actif ? "Actif" : "Désactivé"}
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-border pt-4">
                  <form action={changerRoleAction} className="flex items-end gap-2">
                    <input type="hidden" name="utilisateurId" value={u.id} />
                    <div>
                      <label className={LABEL_XS_CLASSES}>Rôle</label>
                      <select name="role" defaultValue={u.role} className={CONTROL_SM_CLASSES}>
                        {ROLES_STAFF.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button type="submit" variant="secondary" size="sm">
                      Changer
                    </Button>
                  </form>

                  <form action={reinitialiserMotDePasseAction} className="flex items-end gap-2">
                    <input type="hidden" name="utilisateurId" value={u.id} />
                    <div>
                      <label className={LABEL_XS_CLASSES}>Nouveau mot de passe</label>
                      <input
                        type="password"
                        name="motDePasse"
                        required
                        minLength={LONGUEUR_MIN_MOT_DE_PASSE}
                        autoComplete="new-password"
                        className={`w-44 ${CONTROL_SM_CLASSES}`}
                      />
                    </div>
                    <Button type="submit" variant="secondary" size="sm">
                      Réinitialiser
                    </Button>
                  </form>

                  {u._count.sessions > 0 && (
                    <form action={revoquerSessionsAction}>
                      <input type="hidden" name="utilisateurId" value={u.id} />
                      <Button type="submit" variant="secondary" size="sm">
                        Révoquer les sessions
                      </Button>
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
                      className={`rounded-md border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                        u.actif
                          ? "border-rust-border text-rust hover:bg-rust-bg"
                          : "border-sage-border text-sage hover:bg-sage-bg"
                      }`}
                    >
                      {u.actif ? "Désactiver" : "Réactiver"}
                    </button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
