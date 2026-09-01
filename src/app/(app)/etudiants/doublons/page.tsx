import { UserSearch } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModule, peutAccederModule, Module } from "@/lib/permissions";
import { champsComparaisonDoublon } from "@/lib/doublons-etudiant";
import { IconChip } from "@/components/ui/icon-chip";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { BackLink } from "@/components/ui/back-link";
import { PopupDoublon } from "../doublon-popup";
import { fusionnerDoublonAction, confirmerHomonymeAction } from "../[id]/actions";

// Vue centralisée de tous les doublons potentiels en attente (voir
// Etudiant.doublonPotentielId, lib/doublons-etudiant.ts) : jusqu'ici
// visibles seulement fiche par fiche (bandeau) ou via le badge/KPI, ce qui
// obligeait le staff à tomber dessus un par un plutôt que de les traiter
// d'affilée.
export default async function DoublonsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const session = await requireModule(Module.ETUDIANTS, "LECTURE");
  const peutResoudre = await peutAccederModule(session.role, Module.ETUDIANTS, "ECRITURE");
  const { ok } = await searchParams;

  const doublons = await prisma.etudiant.findMany({
    where: { doublonPotentielId: { not: null } },
    orderBy: { creeLe: "desc" },
    select: {
      ...champsComparaisonDoublon,
      _count: { select: { dossiersAnnuels: true, presences: true } },
      doublonPotentiel: { select: champsComparaisonDoublon },
    },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <IconChip icon={UserSearch} accent="ochre" />
        <div>
          <BackLink href="/etudiants" label="Étudiants" />
          <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">
            Doublons potentiels
          </h1>
          <p className="text-sm text-ink-muted">
            Préinscriptions qui ressemblent à une fiche déjà existante — à
            traiter une par une.
          </p>
        </div>
      </div>

      {ok && <Alert variant="success">Résolu.</Alert>}

      {doublons.length === 0 ? (
        <EmptyState message="Aucun doublon potentiel en attente." />
      ) : (
        <ul className="space-y-3">
          {doublons.map((d) => (
            <li key={d.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {d.prenom} {d.nom}
                      <span className="ml-2 font-normal text-ink-muted">
                        · créée le {new Date(d.creeLe).toLocaleDateString("fr-FR")}
                      </span>
                    </p>
                    <p className="text-xs text-ink-faint">
                      Ressemble à {d.doublonPotentiel!.prenom} {d.doublonPotentiel!.nom} · créée le{" "}
                      {new Date(d.doublonPotentiel!.creeLe).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  {peutResoudre && (
                    <PopupDoublon
                      doublon={d}
                      existant={d.doublonPotentiel!}
                      fusionBloquee={d._count.dossiersAnnuels > 0 || d._count.presences > 0}
                      fusionnerAction={fusionnerDoublonAction}
                      confirmerHomonymeAction={confirmerHomonymeAction}
                      redirectTo="/etudiants/doublons"
                    />
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
