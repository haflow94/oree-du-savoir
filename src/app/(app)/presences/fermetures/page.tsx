import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import {
  creerPeriodeFermetureAction,
  modifierPeriodeFermetureAction,
  supprimerPeriodeFermetureAction,
} from "../actions";

function versChampDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function FermeturesPage() {
  await requireRole([Role.BUREAU, Role.ADMINISTRATION]);

  const annees = await prisma.anneeScolaire.findMany({
    orderBy: { libelle: "desc" },
    include: { periodesFermeture: { orderBy: { dateDebut: "asc" } } },
  });

  const anneeParDefaut = annees.find((a) => a.active)?.id ?? annees[0]?.id;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/presences" className="text-sm text-slate-500 hover:underline">
          ← Présences
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">
          Vacances et fermetures
        </h2>
        <p className="text-sm text-slate-500">
          Aucune séance n&apos;est générée sur ces périodes. Pour un imprévu
          ponctuel, annulez plutôt la séance concernée.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          Ajouter une période
        </h3>
        <form action={creerPeriodeFermetureAction} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Année scolaire
            </label>
            <select
              name="anneeScolaireId"
              required
              defaultValue={anneeParDefaut}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              {annees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.libelle}
                  {a.active ? " (active)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Libellé</label>
            <input
              type="text"
              name="libelle"
              required
              placeholder="ex. Vacances de février"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Du</label>
            <input
              type="date"
              name="dateDebut"
              required
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Au</label>
            <input
              type="date"
              name="dateFin"
              required
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Ajouter
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Les séances déjà générées ne sont pas supprimées : annulez-les
          depuis la séance si nécessaire.
        </p>
      </div>

      {annees.map((a) => (
        <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            {a.libelle}
            {a.active && (
              <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                active
              </span>
            )}
          </h3>
          {a.periodesFermeture.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune période enregistrée.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {a.periodesFermeture.map((p) => (
                <li key={p.id} className="py-2">
                  <details>
                    <summary className="flex cursor-pointer justify-between">
                      <span className="font-medium text-slate-800">{p.libelle}</span>
                      <span className="text-slate-500">
                        {new Date(p.dateDebut).toLocaleDateString("fr-FR")} →{" "}
                        {new Date(p.dateFin).toLocaleDateString("fr-FR")}
                      </span>
                    </summary>
                    <form
                      action={modifierPeriodeFermetureAction}
                      className="mt-3 flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="periodeId" value={p.id} />
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Libellé
                        </label>
                        <input
                          type="text"
                          name="libelle"
                          required
                          defaultValue={p.libelle}
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Du
                        </label>
                        <input
                          type="date"
                          name="dateDebut"
                          required
                          defaultValue={versChampDate(p.dateDebut)}
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Au
                        </label>
                        <input
                          type="date"
                          name="dateFin"
                          required
                          defaultValue={versChampDate(p.dateFin)}
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        />
                      </div>
                      <button
                        type="submit"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Enregistrer
                      </button>
                    </form>
                    <form action={supprimerPeriodeFermetureAction} className="mt-2">
                      <input type="hidden" name="periodeId" value={p.id} />
                      <button
                        type="submit"
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Supprimer cette période
                      </button>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
