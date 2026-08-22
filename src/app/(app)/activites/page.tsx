import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasRole, Role } from "@/lib/roles";
import { activiteDansFenetreDeRappel, RAPPEL_JOURS } from "@/lib/activites";
import { aujourdhuiUTC } from "@/lib/calendrier";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { IconChip } from "@/components/ui/icon-chip";
import { NouvelleActiviteDialog } from "./activite-dialog";
import { ActiviteRow } from "./activite-row";

const PEUT_GERER = [Role.BUREAU, Role.ADMINISTRATION, Role.ACTIVITE];

const MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Le titre et la date sont obligatoires.",
  PLAGE_INVALIDE: "La date de fin ne peut pas être avant la date de début.",
  FIN_RECURRENCE_MANQUANTE: "Une activité récurrente doit avoir une date de fin de récurrence.",
  INTROUVABLE: "Cette activité n'existe plus.",
};

export default async function ActivitesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; activiteId?: string }>;
}) {
  const session = await requireSession();
  const peutGerer = hasRole(session.role, PEUT_GERER);
  const { error, ok, activiteId } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const [activites, responsablesDisponibles] = await Promise.all([
    prisma.activite.findMany({
      orderBy: { date: "asc" },
      include: { responsables: { include: { utilisateur: true } } },
    }),
    // Seuls les comptes Role.ACTIVITE peuvent être désignés responsables
    // (voir Administration → Responsables d'activités) : le reste du staff
    // gère l'appli plus largement mais n'est pas censé être affecté
    // nommément à une activité.
    prisma.utilisateur.findMany({
      where: { actif: true, role: Role.ACTIVITE },
      orderBy: [{ nom: "asc" }],
      select: { id: true, prenom: true, nom: true, role: true },
    }),
  ]);
  const aujourdhui = aujourdhuiUTC();
  const aVenir = activites.filter((a) => a.date >= aujourdhui);
  const passees = activites.filter((a) => a.date < aujourdhui);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconChip icon={PartyPopper} accent="sage" />
          <div>
            <h1 className="font-display text-3xl font-semibold text-pine-strong">Activités</h1>
            <p className="text-sm text-ink-muted">
              Sorties, fêtes, réunions... Visibles sur le{" "}
              <Link href="/calendrier" className="underline">
                calendrier
              </Link>
              , avec un rappel {RAPPEL_JOURS} jours avant la date.
            </p>
          </div>
        </div>
        {peutGerer && (
          <NouvelleActiviteDialog
            ouvrirAuChargement={!!error && !activiteId}
            responsablesDisponibles={responsablesDisponibles}
          />
        )}
      </div>

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      {activites.length === 0 ? (
        <EmptyState message="Aucune activité pour l'instant." />
      ) : (
        <>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-card">
            {aVenir.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-faint">
                Aucune activité à venir.
              </p>
            ) : (
              aVenir.map((a) => (
                <ActiviteRow
                  key={a.id}
                  activite={a}
                  dansFenetreDeRappel={activiteDansFenetreDeRappel(a.date, aujourdhui)}
                  ouvrirAuChargement={!!error && activiteId === a.id}
                  peutGerer={peutGerer}
                  responsablesDisponibles={responsablesDisponibles}
                />
              ))
            )}
          </div>

          {passees.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-ink-muted">
                Activités passées ({passees.length})
              </summary>
              <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-elevated opacity-75 shadow-card">
                {passees.map((a) => (
                  <ActiviteRow
                    key={a.id}
                    activite={a}
                    dansFenetreDeRappel={false}
                    ouvrirAuChargement={!!error && activiteId === a.id}
                    peutGerer={peutGerer}
                    responsablesDisponibles={responsablesDisponibles}
                  />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
