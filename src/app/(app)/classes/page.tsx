import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JOUR_LABELS } from "@/lib/planning";
import { creerCoursAction } from "./actions";

export default async function ClassesPage() {
  await requireSession();

  const [cours, classes, anneeActive] = await Promise.all([
    prisma.cours.findMany({ orderBy: { nom: "asc" } }),
    prisma.classe.findMany({
      orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
      include: {
        cours: true,
        anneeScolaire: true,
        enseignants: { include: { utilisateur: true } },
      },
    }),
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Classes</h2>
          <p className="text-sm text-slate-500">
            Cours, classes, créneaux, enseignants, capacité.
          </p>
        </div>
        <Link
          href="/classes/nouveau"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          + Nouvelle classe
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">Cours</h3>
        <div className="flex flex-wrap gap-2">
          {cours.length === 0 && (
            <p className="text-sm text-slate-400">Aucun cours enregistré.</p>
          )}
          {cours.map((c) => (
            <span
              key={c.id}
              className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
            >
              {c.nom}
            </span>
          ))}
        </div>
        <form action={creerCoursAction} className="mt-4 flex gap-2">
          <input
            type="text"
            name="nom"
            required
            placeholder="Nom du nouveau cours"
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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Cours</th>
              <th className="px-4 py-3">Niveau</th>
              <th className="px-4 py-3">Créneau</th>
              <th className="px-4 py-3">Salle</th>
              <th className="px-4 py-3">Capacité</th>
              <th className="px-4 py-3">Enseignant(s)</th>
              <th className="px-4 py-3">Année</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {classes.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">
                  <Link href={`/classes/${c.id}`} className="hover:underline">
                    {c.cours.nom}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {c.niveau ?? "—"}
                  {c.semestre && (
                    <span className="ml-1 text-xs text-slate-400">
                      (S{c.semestre})
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {JOUR_LABELS[c.jour]} {c.heureDebut}–{c.heureFin}
                </td>
                <td className="px-4 py-3 text-slate-500">{c.salle ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">
                  {c.capacite ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {c.enseignants.length > 0
                    ? c.enseignants
                        .map((e) => `${e.utilisateur.prenom} ${e.utilisateur.nom}`)
                        .join(", ")
                    : "—"}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {c.anneeScolaire.libelle}
                </td>
              </tr>
            ))}
            {classes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Aucune classe enregistrée pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!anneeActive && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Aucune année scolaire active : la création de classe utilisera la
          plus récente disponible.
        </p>
      )}
    </div>
  );
}
