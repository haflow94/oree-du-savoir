import { requireRole } from "@/lib/auth";
import { Role } from "@/lib/roles";
import { BackLink } from "@/components/ui/back-link";
import { Alert } from "@/components/ui/alert";
import { TableWrap, TableHead } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SEUIL_ANNEES_INACTIVITE } from "@/lib/rgpd";
import { etudiantsEligiblesAnonymisation } from "@/lib/rgpd-eligibles";
import { anonymiserEtudiantAction } from "./actions";
import { AdminSubNav } from "../sub-nav";

const MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Dossier introuvable.",
  INTROUVABLE: "Cette fiche n'existe plus.",
  PAS_ELIGIBLE: "Ce dossier n'est pas (ou plus) éligible à l'anonymisation.",
};

export default async function RgpdPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireRole([Role.BUREAU]);
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const eligibles = await etudiantsEligiblesAnonymisation();

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/administration" label="Administration" />
        <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">
          RGPD — Dossiers inactifs
        </h1>
        <p className="text-sm text-ink-muted">
          Dossiers sans lien avec l&apos;association depuis plus de{" "}
          {SEUIL_ANNEES_INACTIVITE} ans. L&apos;anonymisation reste manuelle,
          dossier par dossier : aucune purge automatique n&apos;est en place tant
          que le Conseil d&apos;Administration n&apos;a pas validé de politique de
          rétention formelle.
        </p>
      </div>

      <AdminSubNav current="/administration/rgpd" />

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Dossier anonymisé.</Alert>}

      <TableWrap>
        <TableHead>
          <th className="px-4 py-3">Étudiant</th>
          <th className="px-4 py-3">Fin de parcours</th>
          <th className="px-4 py-3" />
        </TableHead>
        <tbody className="divide-y divide-border">
          {eligibles.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-3 font-medium text-ink">
                {e.prenom} {e.nom}
              </td>
              <td className="px-4 py-3 text-ink-muted">
                {e.finParcours.toLocaleDateString("fr-FR")}
              </td>
              <td className="px-4 py-3 text-right">
                <form
                  id={`anonymiser-${e.id}`}
                  action={anonymiserEtudiantAction}
                  className="inline"
                >
                  <input type="hidden" name="etudiantId" value={e.id} />
                </form>
                <ConfirmDialog
                  formId={`anonymiser-${e.id}`}
                  triggerLabel="Anonymiser"
                  title="Anonymiser ce dossier ?"
                  description={`Les données personnelles de ${e.prenom} ${e.nom} (identité, coordonnées, documents) seront définitivement effacées. Les montants et présences déjà enregistrés sont conservés pour la comptabilité. Cette action est irréversible.`}
                  confirmLabel="Anonymiser définitivement"
                />
              </td>
            </tr>
          ))}
          {eligibles.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-8 text-center text-ink-faint">
                Aucun dossier éligible pour l&apos;instant.
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
    </div>
  );
}
