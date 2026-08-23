import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { requireModule, peutAccederModule, Module } from "@/lib/permissions";
import { activiteDansFenetreDeRappel, cleTrimestre, grouperParTrimestre, RAPPEL_JOURS } from "@/lib/activites";
import { aujourdhuiUTC } from "@/lib/calendrier";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { IconChip } from "@/components/ui/icon-chip";
import { buttonVariants } from "@/components/ui/button";
import { CONTROL_SM_CLASSES, TOOLBAR_CLASSES } from "@/components/ui/champ";
import { NouvelleActiviteDialog } from "./activite-dialog";
import { ActiviteRow } from "./activite-row";

const MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Le titre et la date sont obligatoires.",
  PLAGE_INVALIDE: "La date de fin ne peut pas être avant la date de début.",
  FIN_RECURRENCE_MANQUANTE: "Une activité récurrente doit avoir une date de fin de récurrence.",
  INTROUVABLE: "Cette activité n'existe plus.",
};

export default async function ActivitesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; activiteId?: string; q?: string }>;
}) {
  const session = await requireModule(Module.ACTIVITES, "LECTURE");
  const peutGerer = await peutAccederModule(session.role, Module.ACTIVITES, "ECRITURE");
  const { error, ok, activiteId, q } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;
  const recherche = q?.trim() ?? "";

  const [activites, responsablesDisponibles] = await Promise.all([
    prisma.activite.findMany({
      where: recherche
        ? {
            OR: [
              { titre: { contains: recherche, mode: "insensitive" } },
              { contenu: { contains: recherche, mode: "insensitive" } },
              { lieu: { contains: recherche, mode: "insensitive" } },
              {
                responsables: {
                  some: {
                    utilisateur: {
                      OR: [
                        { prenom: { contains: recherche, mode: "insensitive" } },
                        { nom: { contains: recherche, mode: "insensitive" } },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : undefined,
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
  const cleTrimestreCourant = cleTrimestre(aujourdhui);
  const groupes = grouperParTrimestre(activites);
  const groupesPasses = groupes.filter((g) => g.cle < cleTrimestreCourant);
  const groupesEnCoursOuAVenir = groupes.filter((g) => g.cle >= cleTrimestreCourant);
  const nbActivitesPassees = groupesPasses.reduce((n, g) => n + g.activites.length, 0);

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

      <form className={TOOLBAR_CLASSES} action="/activites" method="GET">
        <div>
          <label htmlFor="q" className="sr-only">
            Rechercher par titre, contenu, lieu ou responsable
          </label>
          <input
            id="q"
            type="search"
            name="q"
            defaultValue={recherche}
            placeholder="Titre, contenu, lieu, responsable…"
            className={`w-64 ${CONTROL_SM_CLASSES}`}
          />
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Rechercher
        </button>
      </form>

      {activites.length === 0 ? (
        <EmptyState
          message={
            recherche
              ? "Aucune activité ne correspond à cette recherche."
              : "Aucune activité pour l'instant."
          }
        />
      ) : (
        <>
          {groupesEnCoursOuAVenir.length === 0 ? (
            <p className="text-sm text-ink-faint">Aucune activité à venir ce trimestre.</p>
          ) : (
            <div className="space-y-6">
              {groupesEnCoursOuAVenir.map((g) => (
                <section key={g.cle}>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                    {g.libelle}
                    {g.cle === cleTrimestreCourant && <Badge variant="info">En cours</Badge>}
                  </h2>
                  <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-card">
                    {g.activites.map((a) => (
                      <ActiviteRow
                        key={a.id}
                        activite={a}
                        dansFenetreDeRappel={activiteDansFenetreDeRappel(a.date, aujourdhui)}
                        ouvrirAuChargement={!!error && activiteId === a.id}
                        peutGerer={peutGerer}
                        responsablesDisponibles={responsablesDisponibles}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {groupesPasses.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-ink-muted">
                Trimestres précédents ({nbActivitesPassees})
              </summary>
              <div className="mt-3 space-y-6 opacity-75">
                {groupesPasses.map((g) => (
                  <section key={g.cle}>
                    <h2 className="mb-2 text-sm font-semibold text-ink-muted">{g.libelle}</h2>
                    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-card">
                      {g.activites.map((a) => (
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
                  </section>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
