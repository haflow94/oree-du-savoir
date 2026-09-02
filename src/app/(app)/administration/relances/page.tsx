import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";
import {
  modifierParametresRelanceAction,
  modifierParametresAlerteChequeAction,
  modifierDureeIntensiveRapportAction,
} from "./actions";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardTitle } from "@/components/ui/card";
import { Champ } from "@/components/ui/champ";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { AdminSubNav } from "../sub-nav";

const MESSAGES: Record<string, string> = {
  CHAMPS_INVALIDES: "Le nombre, le délai et la durée doivent être des entiers positifs.",
  INTROUVABLE: "Réglage introuvable — relancer le seed (npm run db:seed).",
};

export default async function RelancesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireModule(Module.ADMINISTRATION, "ECRITURE");
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const parametres = await prisma.parametresRelance.findFirst();

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/administration" label="Administration" />
        <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">Relances</h1>
        <p className="text-sm text-ink-muted">
          Réglage du rappel automatique envoyé (hors app, via n8n) aux
          dossiers annuels sans aucun paiement apporté et/ou sans pièce
          d&apos;identité — jamais basé sur le statut Soldé/Partiel/Impayé
          d&apos;un dossier, qui reflète l&apos;encaissement réel en
          trésorerie plutôt que ce que la famille a effectivement apporté.
        </p>
      </div>

      <AdminSubNav current="/administration/relances" />

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      {!parametres ? (
        <Alert variant="danger">Aucun réglage en base — exécuter le seed (npm run db:seed).</Alert>
      ) : (
        <Card>
          <CardTitle>Rappel automatique</CardTitle>
          <form
            action={modifierParametresRelanceAction}
            className="mt-3 grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="parametresId" value={parametres.id} />
            <Champ
              label="Nombre maximum de relances"
              name="nombreMaxRelances"
              type="number"
              min={1}
              required
              defaultValue={parametres.nombreMaxRelances}
              hint="Au-delà, le dossier n'est plus proposé au flux automatique — le staff reprend la main manuellement."
            />
            <Champ
              label="Délai entre deux relances (jours)"
              name="delaiJours"
              type="number"
              min={1}
              required
              defaultValue={parametres.delaiJours}
              hint="Compté depuis la création du dossier annuel pour la première relance, puis depuis la dernière relance envoyée."
            />

            <div className="flex justify-end sm:col-span-2">
              <SubmitButton variant="primary" pendingLabel="Enregistrement…">
                Enregistrer
              </SubmitButton>
            </div>
          </form>
        </Card>
      )}

      {parametres && (
        <Card>
          <CardTitle>Alerte chèque non déposé</CardTitle>
          <p className="mt-1 text-sm text-ink-muted">
            Alerte interne envoyée au Bureau (hors app, via n8n) quand un
            chèque reçu n&apos;a toujours pas été déposé — réglage distinct
            du rappel ci-dessus, ce n&apos;est pas la même règle métier.
          </p>
          <form
            action={modifierParametresAlerteChequeAction}
            className="mt-3 grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="parametresId" value={parametres.id} />
            <Champ
              label="Nombre maximum d'alertes"
              name="nombreMaxAlertesCheque"
              type="number"
              min={1}
              required
              defaultValue={parametres.nombreMaxAlertesCheque}
              hint="Au-delà, le chèque n'est plus proposé au flux automatique — le Bureau reprend la main manuellement."
            />
            <Champ
              label="Délai avant l'alerte (jours)"
              name="delaiJoursCheque"
              type="number"
              min={1}
              required
              defaultValue={parametres.delaiJoursCheque}
              hint="Compté depuis la réception du chèque (date du paiement enregistré)."
            />

            <div className="flex justify-end sm:col-span-2">
              <SubmitButton variant="primary" pendingLabel="Enregistrement…">
                Enregistrer
              </SubmitButton>
            </div>
          </form>
        </Card>
      )}

      {parametres && (
        <Card>
          <CardTitle>Rapport effectifs + trésorerie</CardTitle>
          <p className="mt-1 text-sm text-ink-muted">
            Rapport automatique envoyé au Bureau (hors app, via n8n) :
            hebdomadaire (le lundi) pendant les premières semaines suivant le
            1er septembre, puis mensuel (le dernier jour du mois) le reste de
            l&apos;année — y compris l&apos;été, où des inscriptions
            continuent d&apos;arriver.
          </p>
          <form
            action={modifierDureeIntensiveRapportAction}
            className="mt-3 grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="parametresId" value={parametres.id} />
            <Champ
              label="Durée de la période hebdomadaire (semaines)"
              name="dureeIntensiveRapportSemaines"
              type="number"
              min={1}
              required
              defaultValue={parametres.dureeIntensiveRapportSemaines}
              hint="Comptée depuis le 1er septembre. Au-delà, le rapport repasse automatiquement en cadence mensuelle."
            />

            <div className="flex justify-end sm:col-span-2">
              <SubmitButton variant="primary" pendingLabel="Enregistrement…">
                Enregistrer
              </SubmitButton>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
