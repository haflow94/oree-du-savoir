import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";
import {
  creerSectionAction,
  modifierSectionAction,
  supprimerSectionAction,
  ajouterCreneauAction,
  supprimerCreneauAction,
} from "./actions";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardTitle } from "@/components/ui/card";
import { Champ, ChampSelect, ChampTextarea } from "@/components/ui/champ";
import { Button, buttonVariants } from "@/components/ui/button";
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
    include: { _count: { select: { cours: true } }, creneaux: { orderBy: { ordre: "asc" } } },
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
                  modeleDossier: s.modeleDossier,
                  reglesSpecifiques: s.reglesSpecifiques.join("\n"),
                }}
              />
              <div className="flex justify-end sm:col-span-3">
                <Button type="submit" variant="secondary">
                  Enregistrer
                </Button>
              </div>
            </form>

            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Créneaux du dossier d&apos;inscription
              </p>
              {s.creneaux.length === 0 ? (
                <p className="mb-2 text-sm text-ink-faint">Aucun créneau pour l&apos;instant.</p>
              ) : (
                <ul className="mb-3 space-y-1">
                  {s.creneaux.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        <span className="font-mono text-xs text-ochre">{c.code}</span> — {c.jour},{" "}
                        {c.horaire}
                        {c.restriction && (
                          <span className="text-ink-faint"> ({c.restriction})</span>
                        )}
                      </span>
                      <form action={supprimerCreneauAction}>
                        <input type="hidden" name="creneauId" value={c.id} />
                        <button type="submit" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                          Retirer
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              <form action={ajouterCreneauAction} className="grid gap-2 sm:grid-cols-5">
                <input type="hidden" name="sectionId" value={s.id} />
                <Champ label="Code" name="code" id={`creneau-code-${s.id}`} required placeholder="CS" />
                <Champ label="Jour" name="jour" id={`creneau-jour-${s.id}`} required placeholder="Dimanche" />
                <Champ
                  label="Horaire"
                  name="horaire"
                  id={`creneau-horaire-${s.id}`}
                  required
                  placeholder="09h00 – 13h00"
                />
                <Champ
                  label="Restriction (optionnel)"
                  name="restriction"
                  id={`creneau-restriction-${s.id}`}
                  placeholder="Seulement Niveau 1"
                />
                <div className="flex items-end">
                  <Button type="submit" variant="secondary" size="sm">
                    Ajouter
                  </Button>
                </div>
              </form>
            </div>
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
    modeleDossier: string;
    reglesSpecifiques: string;
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
      <ChampSelect
        label="Modèle de dossier"
        name="modeleDossier"
        id={`modeleDossier${idSuffix}`}
        required
        defaultValue={defaults?.modeleDossier ?? "ADULTES"}
        hint="Détermine le gabarit PDF utilisé (voir Dossiers vierges)."
      >
        <option value="ADULTES">Adultes</option>
        <option value="JEUNES">Jeunes</option>
      </ChampSelect>
      <ChampTextarea
        label="Dispositions propres à la section (optionnel, une par ligne)"
        name="reglesSpecifiques"
        id={`reglesSpecifiques${idSuffix}`}
        className="sm:col-span-3"
        rows={2}
        defaultValue={defaults?.reglesSpecifiques}
        placeholder={"Une règle par ligne, affichée dans le règlement du dossier."}
      />
    </>
  );
}
