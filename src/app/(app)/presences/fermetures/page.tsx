import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import {
  creerPeriodeFermetureAction,
  modifierPeriodeFermetureAction,
  supprimerPeriodeFermetureAction,
} from "../actions";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { CONTROL_CLASSES } from "@/components/ui/champ";

const CONTROL_SM_CLASSES =
  "rounded-md border border-border-strong bg-bg-elevated px-2 py-1.5 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";
const LABEL_XS_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

const MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Tous les champs sont obligatoires.",
  FERMETURE_INTROUVABLE: "Cette période n'existe plus.",
};

function versChampDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function FermeturesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  // Carve-out littéral (voir le commentaire de genererSeancesAction dans
  // presences/actions.ts) : jamais piloté par le module Présences.
  await requireRole([Role.BUREAU, Role.ADMINISTRATION]);
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const annees = await prisma.anneeScolaire.findMany({
    orderBy: { libelle: "desc" },
    include: { periodesFermeture: { orderBy: { dateDebut: "asc" } } },
  });

  const anneeParDefaut = annees.find((a) => a.active)?.id ?? annees[0]?.id;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <BackLink href="/presences" label="Présences" />
        <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">
          Vacances et fermetures
        </h1>
        <p className="text-sm text-ink-muted">
          Aucune séance n&apos;est générée sur ces périodes. Pour un imprévu
          ponctuel, annulez plutôt la séance concernée.
        </p>
      </div>

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      <Card>
        <CardTitle>Ajouter une période</CardTitle>
        <form action={creerPeriodeFermetureAction} className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="anneeScolaireId-nouvelle" className={LABEL_XS_CLASSES}>Année scolaire</label>
            <select
              id="anneeScolaireId-nouvelle"
              name="anneeScolaireId"
              required
              defaultValue={anneeParDefaut}
              className={CONTROL_CLASSES}
            >
              {annees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.libelle}
                  {a.active ? " (active)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="libelle-nouvelle" className={LABEL_XS_CLASSES}>Libellé</label>
            <input
              id="libelle-nouvelle"
              type="text"
              name="libelle"
              required
              placeholder="ex. Vacances de février"
              className={CONTROL_CLASSES}
            />
          </div>
          <div>
            <label htmlFor="dateDebut-nouvelle" className={LABEL_XS_CLASSES}>Du</label>
            <input id="dateDebut-nouvelle" type="date" name="dateDebut" required className={CONTROL_CLASSES} />
          </div>
          <div>
            <label htmlFor="dateFin-nouvelle" className={LABEL_XS_CLASSES}>Au</label>
            <input id="dateFin-nouvelle" type="date" name="dateFin" required className={CONTROL_CLASSES} />
          </div>
          <SubmitButton variant="primary" pendingLabel="Ajout…">
            Ajouter
          </SubmitButton>
        </form>
        <p className="mt-3 text-xs text-ink-faint">
          Les séances déjà générées ne sont pas supprimées : annulez-les
          depuis la séance si nécessaire.
        </p>
      </Card>

      {annees.map((a) => (
        <Card key={a.id}>
          <CardTitle>
            {a.libelle}
            {a.active && (
              <Badge variant="success">
                <span className="ml-2">active</span>
              </Badge>
            )}
          </CardTitle>
          {a.periodesFermeture.length === 0 ? (
            <div className="mt-3">
              <EmptyState message="Aucune période enregistrée." />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border text-sm">
              {a.periodesFermeture.map((p) => (
                <li key={p.id} className="py-2">
                  <details>
                    <summary className="flex cursor-pointer justify-between">
                      <span className="font-medium text-ink">{p.libelle}</span>
                      <span className="text-ink-muted">
                        {new Date(p.dateDebut).toLocaleDateString("fr-FR")} →{" "}
                        {new Date(p.dateFin).toLocaleDateString("fr-FR")}
                      </span>
                    </summary>
                    <form
                      action={modifierPeriodeFermetureAction}
                      className="mt-3 flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="periodeId" value={p.id} />
                      <div>
                        <label htmlFor={`libelle-${p.id}`} className={LABEL_XS_CLASSES}>Libellé</label>
                        <input
                          id={`libelle-${p.id}`}
                          type="text"
                          name="libelle"
                          required
                          defaultValue={p.libelle}
                          className={CONTROL_SM_CLASSES}
                        />
                      </div>
                      <div>
                        <label htmlFor={`dateDebut-${p.id}`} className={LABEL_XS_CLASSES}>Du</label>
                        <input
                          id={`dateDebut-${p.id}`}
                          type="date"
                          name="dateDebut"
                          required
                          defaultValue={versChampDate(p.dateDebut)}
                          className={CONTROL_SM_CLASSES}
                        />
                      </div>
                      <div>
                        <label htmlFor={`dateFin-${p.id}`} className={LABEL_XS_CLASSES}>Au</label>
                        <input
                          id={`dateFin-${p.id}`}
                          type="date"
                          name="dateFin"
                          required
                          defaultValue={versChampDate(p.dateFin)}
                          className={CONTROL_SM_CLASSES}
                        />
                      </div>
                      <SubmitButton variant="secondary" size="sm" pendingLabel="Enregistrement…">
                        Enregistrer
                      </SubmitButton>
                    </form>
                    <form action={supprimerPeriodeFermetureAction} className="mt-2">
                      <input type="hidden" name="periodeId" value={p.id} />
                      <button type="submit" className="text-xs font-medium text-rust hover:underline">
                        Supprimer cette période
                      </button>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
