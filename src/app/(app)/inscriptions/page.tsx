import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function InscriptionsPage() {
  await requireSession();

  const preinscrits = await prisma.etudiant.findMany({
    where: { statutInscription: "PREINSCRIT" },
    orderBy: { creeLe: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Inscriptions</h2>
        <p className="text-sm text-slate-500">
          Préinscriptions en attente de contrôle sur place (signature,
          documents, paiement) avant validation.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">
          Formulaire public
        </h3>
        <p className="text-sm text-slate-600">
          Les futurs étudiants peuvent préremplir leur dossier sans compte
          depuis{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
            /preinscription
          </code>
          .
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Reçu le</th>
              <th className="px-4 py-3">Remarque</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {preinscrits.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">
                  <Link href={`/etudiants/${e.id}`} className="hover:underline">
                    {e.prenom} {e.nom}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(e.creeLe).toLocaleDateString("fr-FR")}
                </td>
                <td className="px-4 py-3 text-slate-500">{e.remarque ?? "—"}</td>
              </tr>
            ))}
            {preinscrits.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  Aucune préinscription en attente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
