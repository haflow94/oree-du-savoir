import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import {
  MoyenPaiement,
  MOYEN_LABELS,
  TypeMouvement,
  TYPE_MOUVEMENT_LABELS,
} from "@/lib/paiements";
import { modifierMouvementAction, supprimerMouvementAction } from "../actions";

const PEUT_GERER = [Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU];

const MESSAGES: Record<string, string> = {
  CHAMPS_INVALIDES: "Tous les champs obligatoires doivent être renseignés.",
};

function versChampDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function MouvementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireRole(PEUT_GERER);
  const { id } = await params;
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const [mouvement, categories] = await Promise.all([
    prisma.mouvementTresorerie.findUnique({ where: { id } }),
    prisma.categorieMouvement.findMany({ orderBy: { nom: "asc" } }),
  ]);

  if (!mouvement) {
    notFound();
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/tresorerie" className="text-sm text-slate-500 hover:underline">
          ← Trésorerie
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">
          Modifier le mouvement
        </h2>
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
        <form action={modifierMouvementAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="mouvementId" value={mouvement.id} />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
            <input
              type="date"
              name="date"
              required
              defaultValue={versChampDate(mouvement.date)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Libellé</label>
            <input
              type="text"
              name="libelle"
              required
              defaultValue={mouvement.libelle}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
            <select
              name="type"
              required
              defaultValue={mouvement.type}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              {Object.values(TypeMouvement).map((t) => (
                <option key={t} value={t}>
                  {TYPE_MOUVEMENT_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Moyen</label>
            <select
              name="moyen"
              required
              defaultValue={mouvement.moyen}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              {Object.values(MoyenPaiement).map((m) => (
                <option key={m} value={m}>
                  {MOYEN_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Montant</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="montant"
              required
              defaultValue={mouvement.montant.toString()}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Catégorie</label>
            <select
              name="categorieId"
              defaultValue={mouvement.categorieId ?? ""}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Justificatif (référence, optionnel)
            </label>
            <input
              type="text"
              name="justificatif"
              defaultValue={mouvement.justificatif ?? ""}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </div>

      <form action={supprimerMouvementAction} className="flex justify-end">
        <input type="hidden" name="mouvementId" value={mouvement.id} />
        <button
          type="submit"
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Supprimer ce mouvement
        </button>
      </form>
    </div>
  );
}
