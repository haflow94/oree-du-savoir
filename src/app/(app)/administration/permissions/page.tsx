import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, ROLE_LABELS, ALL_ROLES } from "@/lib/roles";
import { Module, NiveauAcces, MODULE_LABELS } from "@/lib/permissions";
import { enregistrerPermissionsAction } from "./actions";
import { BackLink } from "@/components/ui/back-link";
import { AdminSubNav } from "../sub-nav";
import { Card, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { CONTROL_SM_CLASSES } from "@/components/ui/champ";

const MESSAGES: Record<string, string> = {
  CHAMPS_INVALIDES: "Un des champs de la grille est invalide — réessayez.",
};

const NIVEAU_LABELS: Record<NiveauAcces, string> = {
  AUCUN: "Aucun accès",
  LECTURE: "Lecture seule",
  ECRITURE: "Lecture-écriture",
};

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  // Carve-out littéral, jamais piloté par la grille elle-même (voir
  // lib/permissions.ts) : cette page ne doit pas pouvoir s'ouvrir à un autre
  // rôle même si la table lui accordait par erreur un accès au module
  // Administration.
  await requireRole([Role.BUREAU]);
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const modules = Object.values(Module);
  const lignes = await prisma.permissionRole.findMany();
  const niveauParCle = new Map(lignes.map((l) => [`${l.role}:${l.module}`, l.niveau]));

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/administration" label="Administration" />
        <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">Permissions</h1>
        <p className="text-sm text-ink-muted">
          Accès de chaque rôle à chaque module de l&apos;application. Le Bureau a
          toujours accès complet et n&apos;apparaît pas dans la grille éditable.
        </p>
      </div>

      <AdminSubNav current="/administration/permissions" />

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      <Card>
        <CardTitle>Ce qui n&apos;est pas géré par cette grille</CardTitle>
        <p className="mt-1 text-sm text-ink-muted">
          Quelques règles fixes existent en dehors de ce tableau — elles ne
          peuvent pas être modifiées ici, quels que soient les réglages
          ci-dessous.
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-muted">
          <li>
            Gestion des comptes (créer/modifier/désactiver un compte,
            réinitialiser un mot de passe), y compris les onglets{" "}
            <strong>Enseignants</strong> et <strong>Responsables activités</strong> :
            réservée au Bureau.
          </li>
          <li>
            <strong>Journal d&apos;audit</strong> et cette page{" "}
            <strong>Permissions</strong> elle-même : réservées au Bureau.
          </li>
          <li>
            <strong>RGPD</strong> (anonymisation des dossiers étudiants) :
            réservée au Bureau.
          </li>
          <li>
            <strong>Enseignant</strong> : la case Présences ci-dessous ne lui
            donne accès qu&apos;à la validation de présence sur les classes qui
            lui sont explicitement assignées (jamais toutes les classes,
            même en écriture). L&apos;annulation d&apos;une séance et la gestion des
            vacances/fermetures restent réservées à Bureau et Administration,
            quel que soit le niveau réglé ici pour un autre rôle.
          </li>
        </ul>
      </Card>

      <Card>
        <CardTitle>Grille des droits</CardTitle>
        <form action={enregistrerPermissionsAction} className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[880px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-bg-elevated px-2 py-2 text-left font-medium text-ink-muted">
                  Rôle
                </th>
                {modules.map((module) => (
                  <th
                    key={module}
                    className="px-2 py-2 text-left text-xs font-medium text-ink-muted"
                  >
                    {MODULE_LABELS[module]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="sticky left-0 bg-bg-elevated px-2 py-2 font-medium text-ink-faint">
                  {ROLE_LABELS[Role.BUREAU]}
                </td>
                {modules.map((module) => (
                  <td key={module} className="px-2 py-2">
                    <select
                      disabled
                      value="ECRITURE"
                      className={`${CONTROL_SM_CLASSES} cursor-not-allowed opacity-60`}
                      aria-label={`${ROLE_LABELS[Role.BUREAU]} — ${MODULE_LABELS[module]}`}
                    >
                      <option value="ECRITURE">{NIVEAU_LABELS.ECRITURE}</option>
                    </select>
                  </td>
                ))}
              </tr>
              {ALL_ROLES.filter((role) => role !== Role.BUREAU).map((role) => (
                <tr key={role} className="border-t border-border">
                  <td className="sticky left-0 bg-bg-elevated px-2 py-2 font-medium text-ink">
                    {ROLE_LABELS[role]}
                  </td>
                  {modules.map((module) => {
                    const niveau = niveauParCle.get(`${role}:${module}`) ?? NiveauAcces.AUCUN;
                    return (
                      <td key={module} className="px-2 py-2">
                        <select
                          name={`${role}__${module}`}
                          defaultValue={niveau}
                          className={CONTROL_SM_CLASSES}
                          aria-label={`${ROLE_LABELS[role]} — ${MODULE_LABELS[module]}`}
                        >
                          <option value={NiveauAcces.AUCUN}>{NIVEAU_LABELS.AUCUN}</option>
                          <option value={NiveauAcces.LECTURE}>{NIVEAU_LABELS.LECTURE}</option>
                          <option value={NiveauAcces.ECRITURE}>{NIVEAU_LABELS.ECRITURE}</option>
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex justify-end">
            <SubmitButton variant="primary" pendingLabel="Enregistrement…">
              Enregistrer
            </SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
