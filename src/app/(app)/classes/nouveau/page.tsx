import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { JOURS_ORDONNES, JOUR_LABELS } from "@/lib/planning";
import { creerClasseAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Cours, année, jour et horaires sont obligatoires.",
};

export default async function NouvelleClassePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSession();
  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  const [cours, annees, enseignants] = await Promise.all([
    prisma.cours.findMany({ orderBy: { nom: "asc" } }),
    prisma.anneeScolaire.findMany({ orderBy: { libelle: "desc" } }),
    prisma.utilisateur.findMany({
      where: { role: Role.ENSEIGNANT, actif: true },
      orderBy: [{ nom: "asc" }],
    }),
  ]);

  const anneeParDefaut = annees.find((a) => a.active)?.id ?? annees[0]?.id;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Nouvelle classe
        </h2>
        <p className="text-sm text-slate-500">
          Un cours doit exister au préalable (voir la page Classes).
        </p>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      {cours.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
          Aucun cours enregistré.{" "}
          <Link href="/classes" className="underline">
            Créez d&apos;abord un cours
          </Link>
          , puis revenez ici.
        </p>
      ) : (
        <form action={creerClasseAction} className="space-y-6">
          <fieldset className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <legend className="px-1 text-sm font-semibold text-slate-800">
              Cours et niveau
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="coursId" className="mb-1 block text-sm font-medium text-slate-700">
                  Cours
                </label>
                <select
                  id="coursId"
                  name="coursId"
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  {cours.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
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
                <label htmlFor="niveau" className="mb-1 block text-sm font-medium text-slate-700">
                  Niveau
                </label>
                <input
                  id="niveau"
                  name="niveau"
                  type="text"
                  placeholder="ex. Débutant, CM1…"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div>
                <label htmlFor="semestre" className="mb-1 block text-sm font-medium text-slate-700">
                  Semestre (optionnel)
                </label>
                <select
                  id="semestre"
                  name="semestre"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  <option value="">Toute l&apos;année</option>
                  <option value="1">Semestre 1</option>
                  <option value="2">Semestre 2</option>
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <legend className="px-1 text-sm font-semibold text-slate-800">
              Créneau
            </legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="jour" className="mb-1 block text-sm font-medium text-slate-700">
                  Jour
                </label>
                <select
                  id="jour"
                  name="jour"
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  {JOURS_ORDONNES.map((j) => (
                    <option key={j} value={j}>
                      {JOUR_LABELS[j]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="heureDebut" className="mb-1 block text-sm font-medium text-slate-700">
                  Heure de début
                </label>
                <input
                  id="heureDebut"
                  name="heureDebut"
                  type="time"
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div>
                <label htmlFor="heureFin" className="mb-1 block text-sm font-medium text-slate-700">
                  Heure de fin
                </label>
                <input
                  id="heureFin"
                  name="heureFin"
                  type="time"
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <legend className="px-1 text-sm font-semibold text-slate-800">
              Salle et capacité
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="salle" className="mb-1 block text-sm font-medium text-slate-700">
                  Salle
                </label>
                <input
                  id="salle"
                  name="salle"
                  type="text"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div>
                <label htmlFor="capacite" className="mb-1 block text-sm font-medium text-slate-700">
                  Capacité
                </label>
                <input
                  id="capacite"
                  name="capacite"
                  type="number"
                  min={0}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <legend className="px-1 text-sm font-semibold text-slate-800">
              Enseignant(s)
            </legend>
            {enseignants.length === 0 ? (
              <p className="text-sm text-slate-400">
                Aucun compte avec le rôle Enseignant pour l&apos;instant. La
                création de comptes arrive en Phase 6 (Administration).
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {enseignants.map((e) => (
                  <label
                    key={e.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  >
                    <input type="checkbox" name="enseignants" value={e.id} />
                    {e.prenom} {e.nom}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="flex justify-end gap-3">
            <Link
              href="/classes"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Annuler
            </Link>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Créer la classe
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
