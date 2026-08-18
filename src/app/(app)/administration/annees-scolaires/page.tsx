import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import {
  creerAnneeScolaireAction,
  modifierAnneeScolaireAction,
  activerAnneeScolaireAction,
} from "./actions";

const MESSAGES: Record<string, string> = {
  CHAMPS_INVALIDES: "Libellé et dates sont obligatoires.",
  DATES_INVALIDES: "La date de fin doit être postérieure à la date de début.",
  LIBELLE_DEJA_UTILISE: "Une année scolaire porte déjà ce libellé.",
  INTROUVABLE: "Cette année scolaire n'existe plus.",
};

function versChampDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function AnneesScolairesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireRole([Role.ADMINISTRATION, Role.BUREAU]);
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const annees = await prisma.anneeScolaire.findMany({
    orderBy: { dateDebut: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/administration" className="text-sm text-slate-500 hover:underline">
          ← Administration
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">
          Années scolaires
        </h2>
        <p className="text-sm text-slate-500">
          Une seule année est active à la fois : c&apos;est elle qui sert de
          référence par défaut pour les nouvelles classes et dossiers.
        </p>
      </div>

      {message && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      )}
      {ok && !message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Modification enregistrée.
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          Créer une année scolaire
        </h3>
        <form action={creerAnneeScolaireAction} className="grid gap-3 sm:grid-cols-4">
          <div>
            <label htmlFor="libelle-nouvelle" className="mb-1 block text-xs font-medium text-slate-600">
              Libellé
            </label>
            <input
              id="libelle-nouvelle"
              name="libelle"
              required
              placeholder="ex. 2026/2027"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label htmlFor="dateDebut-nouvelle" className="mb-1 block text-xs font-medium text-slate-600">
              Date de début
            </label>
            <input
              id="dateDebut-nouvelle"
              name="dateDebut"
              type="date"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label htmlFor="dateFin-nouvelle" className="mb-1 block text-xs font-medium text-slate-600">
              Date de fin
            </label>
            <input
              id="dateFin-nouvelle"
              name="dateFin"
              type="date"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="activer" value="1" />
              Activer immédiatement
            </label>
          </div>
          <div className="sm:col-span-4 flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Créer l&apos;année scolaire
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-3">
        {annees.map((a) => (
          <div
            key={a.id}
            className={`rounded-xl border bg-white p-5 shadow-sm ${
              a.active ? "border-emerald-300" : "border-slate-200"
            }`}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="font-medium text-slate-800">
                {a.libelle}
                {a.active && (
                  <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Active
                  </span>
                )}
              </div>
              {!a.active && (
                <form action={activerAnneeScolaireAction}>
                  <input type="hidden" name="anneeId" value={a.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                  >
                    Activer
                  </button>
                </form>
              )}
            </div>

            <form action={modifierAnneeScolaireAction} className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="anneeId" value={a.id} />
              <div>
                <label htmlFor={`libelle-${a.id}`} className="mb-1 block text-xs font-medium text-slate-600">
                  Libellé
                </label>
                <input
                  id={`libelle-${a.id}`}
                  name="libelle"
                  required
                  defaultValue={a.libelle}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div>
                <label htmlFor={`dateDebut-${a.id}`} className="mb-1 block text-xs font-medium text-slate-600">
                  Date de début
                </label>
                <input
                  id={`dateDebut-${a.id}`}
                  name="dateDebut"
                  type="date"
                  required
                  defaultValue={versChampDate(a.dateDebut)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div>
                <label htmlFor={`dateFin-${a.id}`} className="mb-1 block text-xs font-medium text-slate-600">
                  Date de fin
                </label>
                <input
                  id={`dateFin-${a.id}`}
                  name="dateFin"
                  type="date"
                  required
                  defaultValue={versChampDate(a.dateFin)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div className="sm:col-span-3 flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        ))}
        {annees.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
            Aucune année scolaire enregistrée.
          </p>
        )}
      </div>
    </div>
  );
}
