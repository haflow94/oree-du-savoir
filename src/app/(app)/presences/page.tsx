import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { requireModule, Module } from "@/lib/permissions";
import { estAdministratif } from "@/lib/acces-presence";
import { JOUR_LABELS } from "@/lib/planning";
import { aujourdhuiUTC, STATUT_SEANCE_LABELS } from "@/lib/presences";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AutoSubmitInput } from "@/components/ui/auto-submit";
import { CONTROL_CLASSES } from "@/components/ui/champ";
import { IconChip } from "@/components/ui/icon-chip";

const LABEL_XS_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

export default async function PresencesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; archives?: string }>;
}) {
  const session = await requireModule(Module.PRESENCES, "LECTURE");
  const { date, archives } = await searchParams;
  const voirArchives = archives === "1";

  const dateSaisie = date ? new Date(`${date}T00:00:00.000Z`) : null;
  const jourAffiche = dateSaisie && !Number.isNaN(dateSaisie.getTime()) ? dateSaisie : aujourdhuiUTC();
  const jourISO = jourAffiche.toISOString().slice(0, 10);

  const administratif = estAdministratif(session.role);
  const estEnseignant = session.role === Role.ENSEIGNANT;

  const seances = await prisma.seance.findMany({
    where: {
      date: jourAffiche,
      classe: {
        ...(estEnseignant ? { enseignants: { some: { utilisateurId: session.id } } } : {}),
        ...(voirArchives ? {} : { anneeScolaire: { archivee: false } }),
      },
    },
    orderBy: { classe: { heureDebut: "asc" } },
    include: {
      classe: {
        include: {
          cohorte: { include: { cours: true } },
          salle: true,
          _count: { select: { inscriptions: true } },
        },
      },
      _count: { select: { presences: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconChip icon={CheckSquare} accent="sage" />
          <div>
            <h1 className="font-display text-3xl font-semibold text-pine-strong">Présences</h1>
            <p className="text-sm text-ink-muted">
              {estEnseignant
                ? "Vos séances du jour."
                : "Séances du jour, toutes classes."}
            </p>
          </div>
        </div>
        {administratif && (
          <Link href="/presences/fermetures" className={buttonVariants({ variant: "secondary" })}>
            Vacances et fermetures
          </Link>
        )}
      </div>

      <form action="/presences" method="GET" className="flex items-end gap-2">
        <div>
          <label htmlFor="date" className={LABEL_XS_CLASSES}>
            Date
          </label>
          <AutoSubmitInput
            id="date"
            type="date"
            name="date"
            defaultValue={jourISO}
            className={CONTROL_CLASSES}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-ink-muted">
          <AutoSubmitInput type="checkbox" name="archives" value="1" defaultChecked={voirArchives} />
          Voir les archives
        </label>
      </form>

      <div className="space-y-3">
        {seances.map((s) => {
          const complet = s._count.presences === s.classe._count.inscriptions;
          const statutVariant =
            s.statut === "VALIDEE" ? "success" : s.statut === "ANNULEE" ? "neutral" : "warning";
          return (
            <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="font-medium text-ink">
                  {s.classe.cohorte.cours.nom}
                  {s.classe.cohorte.niveau && (
                    <span className="ml-2 text-sm font-normal text-ink-muted">
                      {s.classe.cohorte.niveau}
                    </span>
                  )}
                </div>
                <div className="text-sm text-ink-muted">
                  {JOUR_LABELS[s.classe.cohorte.jour]} {s.classe.heureDebut}–
                  {s.classe.heureFin}
                  {s.classe.salle && ` · ${s.classe.salle.nom}`}
                  {` · ${s.classe._count.inscriptions} inscrit(s)`}
                </div>
                {s.statut === "ANNULEE" && s.motifAnnulation && (
                  <div className="mt-1 text-sm text-ochre">
                    Annulée : {s.motifAnnulation}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={statutVariant}>
                  {STATUT_SEANCE_LABELS[s.statut]}
                  {s.statut === "VALIDEE" && !complet && " (incomplète)"}
                </Badge>
                {s.statut !== "ANNULEE" && (
                  <Link href={`/presences/${s.id}`} className={buttonVariants({ variant: "primary" })}>
                    {s.statut === "VALIDEE" ? "Consulter" : "Faire l'appel"}
                  </Link>
                )}
              </div>
            </Card>
          );
        })}

        {seances.length === 0 && (
          <EmptyState
            message="Aucune séance ce jour-là."
            hint="Les séances sont générées depuis le planning de chaque classe (voir la fiche de la classe)."
          />
        )}
      </div>
    </div>
  );
}
