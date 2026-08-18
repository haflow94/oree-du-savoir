import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { TYPE_DOCUMENT_LABELS } from "@/lib/documents";

const PEUT_VOIR = [Role.ACCUEIL, Role.ADMINISTRATION, Role.BUREAU];

export default async function DocumentsPage() {
  await requireRole(PEUT_VOIR);

  const documents = await prisma.document.findMany({
    orderBy: { creeLe: "desc" },
    include: { etudiant: true },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Documents</h2>
        <p className="text-sm text-slate-500">
          Fichiers rattachés aux étudiants (identité, photo, dossiers,
          justificatifs). Stockés séparément de la base, uniquement les
          métadonnées apparaissent ici.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Étudiant</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Fichier</th>
              <th className="px-4 py-3">Ajouté le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {documents.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">
                  <Link href={`/etudiants/${d.etudiantId}`} className="hover:underline">
                    {d.etudiant.prenom} {d.etudiant.nom}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{TYPE_DOCUMENT_LABELS[d.type]}</td>
                <td className="px-4 py-3 text-slate-500">
                  <a
                    href={`/etudiants/${d.etudiantId}/documents/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {d.nomFichier}
                  </a>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(d.creeLe).toLocaleDateString("fr-FR")}
                </td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  Aucun document pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
