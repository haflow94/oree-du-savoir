import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { estAdministratif } from "@/lib/acces-presence";
import { JOUR_LABELS } from "@/lib/planning";
import { aujourdhuiUTC, STATUT_SEANCE_LABELS } from "@/lib/presences";

export default async function PresencesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireSession();
  const { date } = await searchParams;

  const jourAffiche = date
    ? new Date(`${date}T00:00:00.000Z`)
    : aujourdhuiUTC();
  const jourISO = jourAffiche.toISOString().slice(0, 10);

  const administratif = estAdministratif(session.role);
  const estEnseignant = session.role === Role.ENSEIGNANT;

  const seances = await prisma.seance.findMany({
    where: {
      date: jourAffiche,
      ...(estEnseignant
        ? { classe: { enseignants: { some: { utilisateurId: session.id } } } }
        : {}),
    },
    orderBy: { classe: { heureDebut: "asc" } },
    include: {
      classe: {
        include: {
          cours: true,
          _count: { select: { inscriptions: true } },
        },
      },
      _count: { select: { presences: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Présences</h2>
          <p className="text-sm text-slate-500">
            {estEnseignant
              ? "Vos séances du jour."
              : "Séances du jour, toutes classes."}
          </p>
        </div>
        {administratif && (
          <Link
            href="/presences/fermetures"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Vacances et fermetures
          </Link>
        )}
      </div>

      <form action="/presences" method="GET" className="flex items-end gap-2">
        <div>
          <label htmlFor="date" className="mb-1 block text-xs font-medium text-slate-600">
            Date
          </label>
          <input
            id="date"
            type="date"
            name="date"
            defaultValue={jourISO}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Afficher
        </button>
      </form>

      <div className="space-y-3">
        {seances.map((s) => {
          const complet = s._count.presences === s.classe._count.inscriptions;
          return (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div>
                <div className="font-medium text-slate-800">
                  {s.classe.cours.nom}
                  {s.classe.niveau && (
                    <span className="ml-2 text-sm font-normal text-slate-500">
                      {s.classe.niveau}
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-500">
                  {JOUR_LABELS[s.classe.jour]} {s.classe.heureDebut}–
                  {s.classe.heureFin}
                  {s.classe.salle && ` · ${s.classe.salle}`}
                  {` · ${s.classe._count.inscriptions} inscrit(s)`}
                </div>
                {s.statut === "ANNULEE" && s.motifAnnulation && (
                  <div className="mt-1 text-sm text-amber-700">
                    Annulée : {s.motifAnnulation}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    s.statut === "VALIDEE"
                      ? "bg-emerald-50 text-emerald-700"
                      : s.statut === "ANNULEE"
                        ? "bg-slate-100 text-slate-500"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {STATUT_SEANCE_LABELS[s.statut]}
                  {s.statut === "VALIDEE" && !complet && " (incomplète)"}
                </span>
                {s.statut !== "ANNULEE" && (
                  <Link
                    href={`/presences/${s.id}`}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    {s.statut === "VALIDEE" ? "Consulter" : "Faire l'appel"}
                  </Link>
                )}
              </div>
            </div>
          );
        })}

        {seances.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            Aucune séance ce jour-là. Les séances sont générées depuis le
            planning de chaque classe (voir la fiche de la classe).
          </p>
        )}
      </div>
    </div>
  );
}
