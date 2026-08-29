import { FileStack } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";
import { Card, CardTitle } from "@/components/ui/card";
import { ChampSelect } from "@/components/ui/champ";
import { buttonVariants } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import { BackLink } from "@/components/ui/back-link";
import { EmptyState } from "@/components/ui/empty-state";

// Dossier vierge : pas d'étudiant, zones personnelles laissées vides pour
// une saisie manuscrite après impression (voir route.ts et
// src/lib/dossier/context.ts#construireContexteDossierVierge). Le modèle
// Jeunes n'a qu'une seule section, donc pas de sélecteur ; le modèle
// Adultes en a plusieurs (tarifs/horaires/règles différents par section).
export default async function DossierViergePage() {
  await requireModule(Module.DOCUMENTS, "ECRITURE");

  const sectionsAdultes = await prisma.section.findMany({
    where: { modeleDossier: "ADULTES" },
    orderBy: { nom: "asc" },
  });
  const sectionJeunes = await prisma.section.findFirst({ where: { modeleDossier: "JEUNES" } });

  return (
    <div className="space-y-6">
      <BackLink href="/documents" label="Documents" />
      <div className="flex items-center gap-3">
        <IconChip icon={FileStack} accent="sky" />
        <div>
          <h1 className="font-display text-3xl font-semibold text-pine-strong">Dossiers vierges</h1>
          <p className="text-sm text-ink-muted">
            Dossier d&apos;inscription en PDF sans étudiant, à imprimer pour
            une saisie manuscrite.
          </p>
        </div>
      </div>

      <Card>
        <CardTitle>Modèle Adultes</CardTitle>
        <p className="mb-3 mt-1 text-xs text-ink-faint">
          Études Coraniques, Études Islamiques, Langue Arabe et toute future
          formation adulte. Choisir la section pour obtenir le bon tarif, les
          bons horaires et les règles propres à la section.
        </p>
        {sectionsAdultes.length === 0 ? (
          <EmptyState message="Aucune section Adultes enregistrée." />
        ) : (
          <form
            className="flex flex-wrap items-end gap-2"
            action="/documents/dossier-vierge/generer"
          >
            <input type="hidden" name="modeleDossier" value="ADULTES" />
            <ChampSelect label="Section" name="sectionId" required defaultValue={sectionsAdultes[0]?.id}>
              {sectionsAdultes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </ChampSelect>
            <button
              type="submit"
              formTarget="_blank"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Voir / imprimer
            </button>
            <button
              type="submit"
              formTarget="_blank"
              name="dl"
              value="1"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Télécharger le PDF
            </button>
          </form>
        )}
      </Card>

      <Card>
        <CardTitle>Modèle Jeunes</CardTitle>
        <p className="mb-3 mt-1 text-xs text-ink-faint">
          Formation Jeunes et futurs programmes destinés aux mineurs.
        </p>
        {!sectionJeunes ? (
          <EmptyState message="Aucune section Jeunes enregistrée." />
        ) : (
          <form className="flex flex-wrap items-end gap-2" action="/documents/dossier-vierge/generer">
            <input type="hidden" name="modeleDossier" value="JEUNES" />
            <input type="hidden" name="sectionId" value={sectionJeunes.id} />
            <button
              type="submit"
              formTarget="_blank"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Voir / imprimer
            </button>
            <button
              type="submit"
              formTarget="_blank"
              name="dl"
              value="1"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Télécharger le PDF
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
