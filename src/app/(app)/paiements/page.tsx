import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formaterMontant } from "@/lib/paiements";
import { Role, hasRole } from "@/lib/roles";

const PEUT_CREER = [Role.ACCUEIL, Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU];

export default async function PaiementsPage() {
  const session = await requireSession();

  const [dossiers, annees] = await Promise.all([
    prisma.dossierAnnuel.findMany({
      orderBy: [{ anneeScolaire: { libelle: "desc" } }, { etudiant: { nom: "asc" } }],
      include: {
        etudiant: true,
        anneeScolaire: true,
        echeances: { include: { paiements: true } },
      },
    }),
    prisma.anneeScolaire.findMany({ orderBy: { libelle: "desc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Paiements</h2>
          <p className="text-sm text-slate-500">
            Montant dû, échéances, encaissé, reste, par étudiant et par
            année. Le dossier annuel porte le montant dû global (voir la
            fiche pour les échéances et le détail des paiements).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <form action="/paiements/export" method="GET" className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Exporter (année)
              </label>
              <select
                name="anneeScolaireId"
                defaultValue=""
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              >
                <option value="">Toutes les années</option>
                {annees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.libelle}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Exporter en CSV
            </button>
          </form>
          {hasRole(session.role, PEUT_CREER) && (
            <Link
              href="/paiements/nouveau"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              + Nouveau dossier
            </Link>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Étudiant</th>
              <th className="px-4 py-3">Année</th>
              <th className="px-4 py-3">Dû</th>
              <th className="px-4 py-3">Échéances</th>
              <th className="px-4 py-3">Encaissé</th>
              <th className="px-4 py-3">Reste</th>
              <th className="px-4 py-3">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {dossiers.map((d) => {
              const du = Number.parseFloat(d.montantDu.toString());
              const paiements = d.echeances.flatMap((e) => e.paiements);
              const encaisse = paiements.reduce(
                (total, p) => total + Number.parseFloat(p.montant.toString()),
                0,
              );
              const reste = du - encaisse;
              const statut =
                reste <= 0 ? "Soldé" : encaisse > 0 ? "Partiel" : "Impayé";
              const statutClasses =
                statut === "Soldé"
                  ? "bg-emerald-50 text-emerald-700"
                  : statut === "Partiel"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-red-50 text-red-700";

              return (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <Link href={`/paiements/${d.id}`} className="hover:underline">
                      {d.etudiant.prenom} {d.etudiant.nom}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {d.anneeScolaire.libelle}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formaterMontant(du)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {paiements.length} paiement(s) / {d.echeances.length} échéance(s)
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formaterMontant(encaisse)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formaterMontant(reste)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statutClasses}`}
                    >
                      {statut}
                    </span>
                  </td>
                </tr>
              );
            })}
            {dossiers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Aucun dossier de paiement pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
