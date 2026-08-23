import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModule, peutAccederModule, Module } from "@/lib/permissions";
import {
  VUES_CALENDRIER,
  VUE_LABELS,
  MOIS_LABELS,
  JOURS_COURTS,
  aujourdhuiUTC,
  normaliserDateUTC,
  ajouterJoursUTC,
  debutSemaineUTC,
  debutAnneeUTC,
  finAnneeUTC,
  grilleMoisUTC,
  memeJourUTC,
  versParamDate,
  depuisParamDate,
  decalerDate,
  estVueCalendrier,
  type VueCalendrier,
} from "@/lib/calendrier";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";

function parJour<T>(items: T[], dateDe: (item: T) => Date): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const cle = versParamDate(dateDe(item));
    const liste = map.get(cle) ?? [];
    liste.push(item);
    map.set(cle, liste);
  }
  return map;
}

// Comme parJour, mais range une activité sur chaque jour de son éventuelle
// plage [date, dateFin] plutôt que sur sa seule date de début : un camp de 3
// jours doit apparaître les 3 jours sur le calendrier.
function activitesParJourAvecPlage<T extends { date: Date; dateFin: Date | null }>(
  activites: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const a of activites) {
    let curseur = normaliserDateUTC(a.date);
    const fin = a.dateFin ? normaliserDateUTC(a.dateFin) : curseur;
    while (curseur <= fin) {
      const cle = versParamDate(curseur);
      const liste = map.get(cle) ?? [];
      liste.push(a);
      map.set(cle, liste);
      curseur = ajouterJoursUTC(curseur, 1);
    }
  }
  return map;
}

function fermetureDuJour<T extends { dateDebut: Date; dateFin: Date }>(
  date: Date,
  fermetures: T[],
): T | undefined {
  return fermetures.find(
    (f) => date >= normaliserDateUTC(f.dateDebut) && date <= normaliserDateUTC(f.dateFin),
  );
}

export default async function CalendrierPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; date?: string }>;
}) {
  const session = await requireModule(Module.CALENDRIER, "LECTURE");
  const peutGerer = await peutAccederModule(session.role, Module.CALENDRIER, "ECRITURE");
  const { vue: vueParam, date: dateParam } = await searchParams;
  const vue: VueCalendrier = estVueCalendrier(vueParam) ? vueParam : "semaine";
  const dateRef = depuisParamDate(dateParam) ?? aujourdhuiUTC();
  const aujourdhui = aujourdhuiUTC();

  let debut: Date;
  let fin: Date;
  let grille: Date[][] = [];
  if (vue === "jour") {
    debut = dateRef;
    fin = dateRef;
  } else if (vue === "semaine") {
    debut = debutSemaineUTC(dateRef);
    fin = ajouterJoursUTC(debut, 6);
  } else if (vue === "mois") {
    grille = grilleMoisUTC(dateRef);
    debut = grille[0][0];
    fin = grille[grille.length - 1][6];
  } else {
    debut = debutAnneeUTC(dateRef);
    fin = finAnneeUTC(dateRef);
  }

  const [activites, fermetures, seances] = await Promise.all([
    prisma.activite.findMany({
      // Chevauchement avec la fenêtre affichée : la date de début doit être
      // avant sa fin, et la fin effective (dateFin si l'activité dure
      // plusieurs jours, sinon date) après son début — sans quoi une
      // activité commencée avant `debut` mais qui déborde dedans (ex. un
      // camp à cheval sur deux mois) disparaîtrait de la vue.
      where: {
        date: { lte: fin },
        OR: [{ dateFin: { gte: debut } }, { dateFin: null, date: { gte: debut } }],
      },
      include: { responsables: { include: { utilisateur: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.periodeFermeture.findMany({
      where: { dateDebut: { lte: fin }, dateFin: { gte: debut } },
    }),
    // Vue année : les séances hebdomadaires (une par classe et par semaine)
    // ne feraient que du bruit à cette échelle, aucune valeur ajoutée à les
    // afficher — seules les activités et fermetures y apparaissent.
    vue === "annee"
      ? Promise.resolve([])
      : prisma.seance.findMany({
          where: { date: { gte: debut, lte: fin } },
          include: {
            classe: {
              include: {
                cours: { include: { section: true } },
                enseignants: { include: { utilisateur: true } },
              },
            },
          },
          orderBy: { date: "asc" },
        }),
  ]);

  const activitesParJour = activitesParJourAvecPlage(activites);
  const seancesParJour = parJour(seances, (s) => s.date);

  const libellePeriode =
    vue === "jour"
      ? dateRef.toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
      : vue === "semaine"
        ? `Semaine du ${debut.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" })} au ${fin.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`
        : vue === "mois"
          ? `${MOIS_LABELS[dateRef.getUTCMonth()]} ${dateRef.getUTCFullYear()}`
          : `${dateRef.getUTCFullYear()}`;

  function lienVue(v: VueCalendrier, d: Date = dateRef): string {
    return `/calendrier?vue=${v}&date=${versParamDate(d)}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconChip icon={CalendarDays} accent="sky" />
          <div>
            <h1 className="font-display text-3xl font-semibold text-pine-strong">Calendrier</h1>
            <p className="text-sm capitalize text-ink-muted">{libellePeriode}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={lienVue(vue, decalerDate(dateRef, vue, -1))}
            aria-label="Période précédente"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            ‹
          </Link>
          <Link href={lienVue(vue, aujourdhui)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Aujourd&apos;hui
          </Link>
          <Link
            href={lienVue(vue, decalerDate(dateRef, vue, 1))}
            aria-label="Période suivante"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            ›
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {VUES_CALENDRIER.map((v) => (
          <Link
            key={v}
            href={lienVue(v)}
            className={buttonVariants({ variant: v === vue ? "primary" : "secondary", size: "sm" })}
          >
            {VUE_LABELS[v]}
          </Link>
        ))}
        {peutGerer && (
          <Link
            href="/activites"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "ml-auto" })}
          >
            Gérer les activités
          </Link>
        )}
      </div>

      {vue === "jour" &&
        (() => {
          const cle = versParamDate(dateRef);
          const seancesJour = [...(seancesParJour.get(cle) ?? [])].sort((a, b) =>
            a.classe.heureDebut.localeCompare(b.classe.heureDebut),
          );
          const activitesJour = activitesParJour.get(cle) ?? [];
          const fermeture = fermetureDuJour(dateRef, fermetures);
          return (
            <div className="space-y-5">
              {fermeture && (
                <div className="rounded-lg border border-l-4 border-ochre-border bg-ochre-bg px-3 py-2 text-sm text-ochre">
                  Fermé : {fermeture.libelle}
                </div>
              )}
              <div>
                <h2 className="mb-2 text-sm font-semibold text-ink">Cours</h2>
                {seancesJour.length === 0 ? (
                  <p className="text-sm text-ink-faint">Aucun cours ce jour.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border bg-bg-elevated shadow-card">
                    {seancesJour.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                        <div>
                          <div className="font-medium text-ink">
                            {s.classe.cours.nom}
                            {s.classe.niveau && (
                              <span className="ml-1 text-xs text-ink-faint">({s.classe.niveau})</span>
                            )}
                          </div>
                          <div className="text-xs text-ink-faint">
                            {s.classe.cours.section.nom}
                            {s.classe.salle && ` · ${s.classe.salle}`}
                            {s.classe.enseignants.length > 0 &&
                              ` · ${s.classe.enseignants.map((e) => `${e.utilisateur.prenom} ${e.utilisateur.nom}`).join(", ")}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-ink-muted">
                            {s.classe.heureDebut}–{s.classe.heureFin}
                          </span>
                          {s.statut === "ANNULEE" && <Badge variant="danger">Annulée</Badge>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h2 className="mb-2 text-sm font-semibold text-ink">Activités</h2>
                {activitesJour.length === 0 ? (
                  <p className="text-sm text-ink-faint">Aucune activité ce jour.</p>
                ) : (
                  <ul className="space-y-2">
                    {activitesJour.map((a) => (
                      <li key={a.id} className="rounded-xl border border-sky-border bg-sky-bg px-4 py-3">
                        <div className="font-medium text-sky">
                          {a.heureDebut && `${a.heureDebut}${a.heureFin ? `–${a.heureFin}` : ""} · `}
                          {a.titre}
                        </div>
                        {(a.lieu || a.responsables.length > 0) && (
                          <div className="text-xs text-sky">
                            {[
                              a.lieu,
                              a.responsables.length > 0
                                ? a.responsables.map((r) => `${r.utilisateur.prenom} ${r.utilisateur.nom}`).join(", ")
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                        {a.contenu && <p className="mt-1 text-sm text-ink-muted">{a.contenu}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })()}

      {vue === "semaine" && (
        <div className="overflow-x-auto">
          <div className="grid min-w-[900px] grid-cols-7 gap-2">
            {Array.from({ length: 7 }, (_, i) => ajouterJoursUTC(debut, i)).map((date, i) => {
              const cle = versParamDate(date);
              const seancesJour = [...(seancesParJour.get(cle) ?? [])].sort((a, b) =>
                a.classe.heureDebut.localeCompare(b.classe.heureDebut),
              );
              const activitesJour = activitesParJour.get(cle) ?? [];
              const fermeture = fermetureDuJour(date, fermetures);
              const estAujourdhui = memeJourUTC(date, aujourdhui);
              return (
                <div
                  key={cle}
                  className={`rounded-xl border p-2 ${
                    estAujourdhui ? "border-pine bg-pine-soft/30" : "border-border bg-bg-elevated"
                  }`}
                >
                  <Link
                    href={lienVue("jour", date)}
                    className="mb-2 block text-xs font-semibold uppercase text-ink-faint hover:text-pine"
                  >
                    {JOURS_COURTS[i]} {date.getUTCDate()}
                  </Link>
                  {fermeture ? (
                    <Badge variant="warning">Fermé</Badge>
                  ) : (
                    <div className="space-y-1">
                      {seancesJour.map((s) => (
                        <div
                          key={s.id}
                          className={`truncate rounded-md px-1.5 py-1 text-xs ${
                            s.statut === "ANNULEE"
                              ? "bg-rust-bg text-rust line-through"
                              : "bg-bg-sunken text-ink"
                          }`}
                          title={`${s.classe.heureDebut} ${s.classe.cours.nom}`}
                        >
                          {s.classe.heureDebut} {s.classe.cours.nom}
                        </div>
                      ))}
                      {activitesJour.map((a) => {
                        const noms = a.responsables.map((r) => `${r.utilisateur.prenom} ${r.utilisateur.nom}`);
                        return (
                          <div
                            key={a.id}
                            className="rounded-md bg-sky-bg px-1.5 py-1 text-xs text-sky"
                            title={[a.titre, ...noms].join(" · ")}
                          >
                            <div className="truncate">
                              {a.heureDebut && `${a.heureDebut} `}
                              {a.titre}
                            </div>
                            {noms.length > 0 && <div className="truncate text-sky/70">{noms.join(", ")}</div>}
                          </div>
                        );
                      })}
                      {seancesJour.length === 0 && activitesJour.length === 0 && (
                        <div className="text-xs text-ink-faint">—</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {vue === "mois" && (
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-ink-faint">
              {JOURS_COURTS.map((j) => (
                <div key={j} className="py-1">
                  {j}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grille.flat().map((date) => {
                const cle = versParamDate(date);
                const dansMois = date.getUTCMonth() === dateRef.getUTCMonth();
                const seancesJour = seancesParJour.get(cle) ?? [];
                const activitesJour = activitesParJour.get(cle) ?? [];
                const fermeture = fermetureDuJour(date, fermetures);
                const estAujourdhui = memeJourUTC(date, aujourdhui);
                return (
                  <Link
                    key={cle}
                    href={lienVue("jour", date)}
                    className={`block min-h-[84px] rounded-lg border p-1.5 text-left text-xs hover:border-border-strong ${
                      dansMois ? "border-border bg-bg-elevated" : "border-border/60 bg-bg-sunken/40"
                    } ${estAujourdhui ? "ring-2 ring-pine ring-inset" : ""} ${fermeture ? "bg-ochre-bg/40" : ""}`}
                  >
                    <div className={`font-medium ${dansMois ? "text-ink" : "text-ink-faint"}`}>
                      {date.getUTCDate()}
                    </div>
                    {fermeture && (
                      <div className="mt-0.5 truncate text-[10px] text-ochre">{fermeture.libelle}</div>
                    )}
                    {!fermeture && seancesJour.length > 0 && (
                      <div className="mt-0.5 text-[10px] text-ink-faint">
                        {seancesJour.length} cours
                      </div>
                    )}
                    {activitesJour.slice(0, 2).map((a) => (
                      <div
                        key={a.id}
                        className="mt-0.5 truncate rounded bg-sky-bg px-1 text-[10px] text-sky"
                      >
                        {a.titre}
                      </div>
                    ))}
                    {activitesJour.length > 2 && (
                      <div className="mt-0.5 text-[10px] text-ink-faint">
                        +{activitesJour.length - 2}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {vue === "annee" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, m) => {
            const moisDate = new Date(Date.UTC(dateRef.getUTCFullYear(), m, 1));
            const grilleMois = grilleMoisUTC(moisDate);
            return (
              <div key={m} className="rounded-xl border border-border bg-bg-elevated p-3 shadow-card">
                <Link
                  href={lienVue("mois", moisDate)}
                  className="mb-2 block text-sm font-semibold text-ink hover:text-pine"
                >
                  {MOIS_LABELS[m]}
                </Link>
                <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] text-ink-faint">
                  {JOURS_COURTS.map((j) => (
                    <div key={j}>{j[0]}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {grilleMois.flat().map((date) => {
                    const cle = versParamDate(date);
                    const dansMois = date.getUTCMonth() === m;
                    const fermeture = fermetureDuJour(date, fermetures);
                    const activitesJour = activitesParJour.get(cle) ?? [];
                    const estAujourdhui = memeJourUTC(date, aujourdhui);
                    return (
                      <Link
                        key={cle}
                        href={lienVue("jour", date)}
                        title={activitesJour.map((a) => a.titre).join(", ") || fermeture?.libelle}
                        className={`flex h-5 items-center justify-center rounded text-[9px] ${
                          !dansMois
                            ? "text-ink-faint/40"
                            : fermeture
                              ? "bg-ochre-bg text-ochre"
                              : activitesJour.length > 0
                                ? "bg-sky-bg font-semibold text-sky"
                                : estAujourdhui
                                  ? "bg-pine text-on-accent"
                                  : "text-ink-muted hover:bg-bg-sunken"
                        }`}
                      >
                        {date.getUTCDate()}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
