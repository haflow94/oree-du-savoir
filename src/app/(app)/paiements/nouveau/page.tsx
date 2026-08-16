import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { creerDossierAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Étudiant, année scolaire et montant dû sont obligatoires.",
};

export default async function NouveauDossierPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSession();
  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  const [etudiants, annees] = await Promise.all([
    prisma.etudiant.findMany({ orderBy: [{ nom: "asc" }, { prenom: "asc" }] }),
    prisma.anneeScolaire.findMany({ orderBy: { libelle: "desc" } }),
  ]);

  const anneeParDefaut = annees.find((a) => a.active)?.id ?? annees[0]?.id;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Nouveau dossier de paiement
        </h2>
        <p className="text-sm text-slate-500">
          Le montant dû est saisi manuellement pour l&apos;instant (pas de
          tarification par cours dans le MVP).
        </p>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      {etudiants.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
          Aucun étudiant enregistré.{" "}
          <Link href="/etudiants/nouveau" className="underline">
            Créez d&apos;abord une fiche étudiant
          </Link>
          .
        </p>
      ) : (
        <form action={creerDossierAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <label htmlFor="etudiantId" className="mb-1 block text-sm font-medium text-slate-700">
              Étudiant
            </label>
            <select
              id="etudiantId"
              name="etudiantId"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              {etudiants.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom} {e.prenom}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="anneeScolaireId" className="mb-1 block text-sm font-medium text-slate-700">
              Année scolaire
            </label>
            <select
              id="anneeScolaireId"
              name="anneeScolaireId"
              required
              defaultValue={anneeParDefaut}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
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
            <label htmlFor="montantDu" className="mb-1 block text-sm font-medium text-slate-700">
              Montant dû (€)
            </label>
            <input
              id="montantDu"
              name="montantDu"
              type="number"
              step="0.01"
              min="0"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Link
              href="/paiements"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Annuler
            </Link>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Créer le dossier
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
