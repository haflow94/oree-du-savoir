import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function EtudiantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireSession();
  const { q } = await searchParams;
  const recherche = q?.trim() ?? "";

  const etudiants = await prisma.etudiant.findMany({
    where: recherche
      ? {
          OR: [
            { nom: { contains: recherche, mode: "insensitive" } },
            { prenom: { contains: recherche, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    include: { _count: { select: { responsables: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Étudiants</h2>
          <p className="text-sm text-slate-500">
            Fiche unique par personne, réinscription multi-années à venir.
          </p>
        </div>
        <Link
          href="/etudiants/nouveau"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          + Nouvel étudiant
        </Link>
      </div>

      <form className="flex gap-2" action="/etudiants" method="GET">
        <input
          type="search"
          name="q"
          defaultValue={recherche}
          placeholder="Rechercher par nom ou prénom…"
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <button
          type="submit"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Rechercher
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Prénom</th>
              <th className="px-4 py-3">Date de naissance</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Responsables</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {etudiants.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">
                  <Link href={`/etudiants/${e.id}`} className="hover:underline">
                    {e.nom}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{e.prenom}</td>
                <td className="px-4 py-3 text-slate-500">
                  {e.dateNaissance
                    ? new Date(e.dateNaissance).toLocaleDateString("fr-FR")
                    : "—"}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {e.email ?? e.telephoneMobile ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {e._count.responsables}
                </td>
              </tr>
            ))}
            {etudiants.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  {recherche
                    ? "Aucun étudiant ne correspond à cette recherche."
                    : "Aucun étudiant enregistré pour l'instant."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
