import { requireRole } from "@/lib/auth";
import { Role, ALL_ROLES, ROLE_LABELS } from "@/lib/roles";
import { libellesRoles } from "@/lib/libelles-role";
import { enregistrerLibellesRoleAction } from "./actions";
import { BackLink } from "@/components/ui/back-link";
import { AdminSubNav } from "../sub-nav";
import { Card, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { CONTROL_SM_CLASSES } from "@/components/ui/champ";

const MESSAGES: Record<string, string> = {
  CHAMPS_INVALIDES: "Chaque rôle doit garder un libellé (non vide).",
};

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  // Carve-out littéral, comme /administration/permissions : réservé au
  // Bureau, jamais piloté par la grille de permissions elle-même — les
  // rôles eux-mêmes (pas seulement leur libellé) sont câblés en dur partout
  // dans l'appli (voir CLAUDE.md).
  await requireRole([Role.BUREAU]);
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const roleLabels = await libellesRoles();

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/administration" label="Administration" />
        <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">Rôles</h1>
        <p className="text-sm text-ink-muted">
          Nom affiché pour chaque rôle (listes de comptes, grille de
          permissions). Les rôles eux-mêmes restent fixes — seul leur nom
          affiché se personnalise ici.
        </p>
      </div>

      <AdminSubNav current="/administration/roles" />

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      <Card>
        <CardTitle>Libellés des rôles</CardTitle>
        <form action={enregistrerLibellesRoleAction} className="mt-3 space-y-3">
          {ALL_ROLES.map((role) => (
            <div key={role} className="flex flex-wrap items-center gap-3">
              <label htmlFor={`libelle__${role}`} className="w-56 shrink-0">
                <span className="block text-sm font-medium text-ink">{ROLE_LABELS[role]}</span>
                <span className="block text-xs text-ink-faint">{role}</span>
              </label>
              <input
                id={`libelle__${role}`}
                name={`libelle__${role}`}
                type="text"
                required
                defaultValue={roleLabels[role]}
                className={`w-64 ${CONTROL_SM_CLASSES}`}
              />
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <SubmitButton variant="primary" pendingLabel="Enregistrement…">
              Enregistrer
            </SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
