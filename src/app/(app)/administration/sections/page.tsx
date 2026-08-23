import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";
import {
  creerSectionAction,
  modifierSectionAction,
  supprimerSectionAction,
} from "./actions";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardTitle } from "@/components/ui/card";
import { Champ } from "@/components/ui/champ";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const MESSAGES: Record<string, string> = {
  CHAMPS_INVALIDES:
    "Vérifiez les champs : montants en euros (ex. 490 ou 490.50), pourcentages entre 0 et 100, volume horaire un nombre entier positif.",
  NOM_DEJA_UTILISE: "Une section porte déjà ce nom.",
  INTROUVABLE: "Cette section n'existe plus.",
  SECTION_UTILISEE:
    "Impossible de supprimer : des cours sont rattachés à cette section. Déplacez-les d'abord depuis la page Classes.",
};

export default async function SectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireModule(Module.ADMINISTRATION, "ECRITURE");
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const sections = await prisma.section.findMany({
    orderBy: { nom: "asc" },
    include: { _count: { select: { cours: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/administration" label="Administration" />
        <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">Sections</h1>
        <p className="text-sm text-ink-muted">
          Tarification et barème de remboursement par section (Jeunes,
          Langue Arabe, Études Coraniques, Études Islamiques…).
        </p>
      </div>

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      <Card>
        <CardTitle>Créer une section</CardTitle>
        <form action={creerSectionAction} className="mt-3 grid gap-3 sm:grid-cols-3">
          <ChampsSection />
          <div className="flex justify-end sm:col-span-3">
            <Button type="submit" variant="primary">
              Créer la section
            </Button>
          </div>
        </form>
      </Card>

      <div className="space-y-3">
        {sections.map((s) => (
          <Card key={s.id}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="font-medium text-ink">
                {s.nom}
                <span className="ml-2 text-xs font-normal text-ink-faint">
                  {s._count.cours} cours rattaché(s)
                </span>
              </div>
              <>
                <form id={`supprimer-section-${s.id}`} action={supprimerSectionAction}>
                  <input type="hidden" name="sectionId" value={s.id} />
                </form>
                <ConfirmDialog
                  formId={`supprimer-section-${s.id}`}
                  triggerLabel="Supprimer"
                  title="Supprimer cette section ?"
                  description={`Cette action supprime définitivement la section « ${s.nom} » et ne peut pas être annulée.`}
                  confirmLabel="Supprimer définitivement"
                  disabled={s._count.cours > 0}
                  disabledTitle="Des cours sont rattachés à cette section : impossible de la supprimer."
                />
              </>
            </div>

            <form action={modifierSectionAction} className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="sectionId" value={s.id} />
              <ChampsSection
                defaults={{
                  nom: s.nom,
                  fraisFormation: s.fraisFormation.toString(),
                  fraisDossier: s.fraisDossier.toString(),
                  volumeHoraireAnnuel: s.volumeHoraireAnnuel?.toString() ?? "",
                  remboursementAvant15Jours: s.remboursementAvant15Jours.toString(),
                  remboursementAvant29Jours: s.remboursementAvant29Jours.toString(),
                }}
              />
              <div className="flex justify-end sm:col-span-3">
                <Button type="submit" variant="secondary">
                  Enregistrer
                </Button>
              </div>
            </form>
          </Card>
        ))}
        {sections.length === 0 && <EmptyState message="Aucune section enregistrée." />}
      </div>
    </div>
  );
}

function ChampsSection({
  defaults,
}: {
  defaults?: {
    nom: string;
    fraisFormation: string;
    fraisDossier: string;
    volumeHoraireAnnuel: string;
    remboursementAvant15Jours: string;
    remboursementAvant29Jours: string;
  };
}) {
  const idSuffix = defaults ? `-${defaults.nom}` : "-nouvelle";
  return (
    <>
      <Champ
        label="Nom"
        name="nom"
        id={`nom${idSuffix}`}
        required
        defaultValue={defaults?.nom}
        placeholder="ex. Langue Arabe"
      />
      <Champ
        label="Frais de formation (€)"
        name="fraisFormation"
        id={`fraisFormation${idSuffix}`}
        required
        inputMode="decimal"
        placeholder="490"
        defaultValue={defaults?.fraisFormation}
      />
      <Champ
        label="Frais de dossier (€)"
        name="fraisDossier"
        id={`fraisDossier${idSuffix}`}
        required
        inputMode="decimal"
        placeholder="60"
        defaultValue={defaults?.fraisDossier}
      />
      <Champ
        label="Volume horaire annuel (h, optionnel)"
        name="volumeHoraireAnnuel"
        id={`volumeHoraireAnnuel${idSuffix}`}
        inputMode="numeric"
        placeholder="120"
        defaultValue={defaults?.volumeHoraireAnnuel}
      />
      <Champ
        label="% remboursé (1er au 15e jour après le début)"
        name="remboursementAvant15Jours"
        id={`remboursementAvant15Jours${idSuffix}`}
        required
        inputMode="numeric"
        min={0}
        max={100}
        placeholder="50"
        defaultValue={defaults?.remboursementAvant15Jours}
      />
      <Champ
        label="% remboursé (15e au 29e jour après le début)"
        name="remboursementAvant29Jours"
        id={`remboursementAvant29Jours${idSuffix}`}
        required
        inputMode="numeric"
        min={0}
        max={100}
        placeholder="25"
        defaultValue={defaults?.remboursementAvant29Jours}
      />
    </>
  );
}
