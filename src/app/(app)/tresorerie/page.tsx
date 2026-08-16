import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MoyenPaiement,
  MOYEN_LABELS,
  TypeMouvement,
  TYPE_MOUVEMENT_LABELS,
  formaterMontant,
} from "@/lib/paiements";
import { creerCategorieAction, creerMouvementAction } from "./actions";

export default async function TresoreriePage() {
  await requireSession();

  const [mouvements, categories] = await Promise.all([
    prisma.mouvementTresorerie.findMany({
      orderBy: [{ date: "asc" }, { creeLe: "asc" }],
      include: { categorie: true },
    }),
    prisma.categorieMouvement.findMany({
      where: { actif: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  const lignes = mouvements.reduce<
    Array<{
      id: string;
      date: Date;
      libelle: string;
      type: (typeof mouvements)[number]["type"];
      moyen: (typeof mouvements)[number]["moyen"];
      categorieNom: string | null;
      montant: number;
      soldeCumule: number;
    }>
  >((acc, m) => {
    const montant = Number.parseFloat(m.montant.toString());
    const precedent = acc.at(-1)?.soldeCumule ?? 0;
    acc.push({
      id: m.id,
      date: m.date,
      libelle: m.libelle,
      type: m.type,
      moyen: m.moyen,
      categorieNom: m.categorie?.nom ?? null,
      montant,
      soldeCumule: precedent + (m.type === "RECETTE" ? montant : -montant),
    });
    return acc;
  }, []);
  const solde = lignes.at(-1)?.soldeCumule ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Trésorerie</h2>
        <p className="text-sm text-slate-500">
          Mouvements recette/dépense, solde calculé en cumul. Volontairement
          simple : pas de comptabilité complète.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-xs uppercase text-slate-400">Solde actuel</div>
        <div className="mt-1 text-2xl font-bold text-slate-800">
          {formaterMontant(solde)}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          Catégories
        </h3>
        <div className="flex flex-wrap gap-2">
          {categories.length === 0 && (
            <p className="text-sm text-slate-400">Aucune catégorie enregistrée.</p>
          )}
          {categories.map((c) => (
            <span key={c.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {c.nom}
            </span>
          ))}
        </div>
        <form action={creerCategorieAction} className="mt-4 flex gap-2">
          <input
            type="text"
            name="nom"
            required
            placeholder="Nom de la nouvelle catégorie"
            className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Ajouter
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          Nouveau mouvement
        </h3>
        <form action={creerMouvementAction} className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
            <input
              type="date"
              name="date"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">Libellé</label>
            <input
              type="text"
              name="libelle"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
            <select
              name="type"
              required
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Catégorie</label>
            <select
              name="categorieId"
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
              placeholder="ex. nom du fichier scanné"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Libellé</th>
              <th className="px-4 py-3">Catégorie</th>
              <th className="px-4 py-3">Moyen</th>
              <th className="px-4 py-3">Montant</th>
              <th className="px-4 py-3">Solde</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lignes.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-500">
                  {new Date(m.date).toLocaleDateString("fr-FR")}
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">{m.libelle}</td>
                <td className="px-4 py-3 text-slate-500">{m.categorieNom ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{MOYEN_LABELS[m.moyen]}</td>
                <td
                  className={`px-4 py-3 font-medium ${
                    m.type === "RECETTE" ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {m.type === "RECETTE" ? "+" : "−"}
                  {formaterMontant(m.montant)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formaterMontant(m.soldeCumule)}
                </td>
              </tr>
            ))}
            {lignes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Aucun mouvement pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
