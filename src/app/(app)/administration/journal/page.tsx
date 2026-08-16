import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";

const PAR_PAGE = 50;

const ACTION_LABELS: Record<string, string> = {
  connexion: "Connexion",
  deconnexion: "Déconnexion",
  creation: "Création",
  creation_compte: "Création de compte",
  activation_compte: "Activation de compte",
  desactivation_compte: "Désactivation de compte",
  changement_role: "Changement de rôle",
  reinitialisation_mot_de_passe: "Réinitialisation de mot de passe",
  revocation_sessions: "Révocation des sessions",
  saisie_paiement: "Saisie d'un paiement",
  validation_presence: "Validation de présence",
  correction_presence: "Correction de présence",
};

export default async function JournalAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole([Role.BUREAU]);
  const { page } = await searchParams;

  const pageCourante = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);

  const [entrees, total] = await Promise.all([
    prisma.journalAudit.findMany({
      orderBy: { horodatage: "desc" },
      skip: (pageCourante - 1) * PAR_PAGE,
      take: PAR_PAGE,
      include: { utilisateur: true },
    }),
    prisma.journalAudit.count(),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAR_PAGE));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/administration" className="text-sm text-slate-500 hover:underline">
          ← Administration
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">
          Journal d&apos;audit
        </h2>
        <p className="text-sm text-slate-500">
          {total} entrée(s). Traçabilité des actions sensibles : comptes,
          paiements, présences.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Auteur</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entité</th>
              <th className="px-4 py-3">Détails</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entrees.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                  {new Date(e.horodatage).toLocaleString("fr-FR")}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {e.utilisateur
                    ? `${e.utilisateur.prenom} ${e.utilisateur.nom}`
                    : "—"}
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {ACTION_LABELS[e.action] ?? e.action}
                </td>
                <td className="px-4 py-3 text-slate-500">{e.entite}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {e.details ? JSON.stringify(e.details) : "—"}
                </td>
              </tr>
            ))}
            {entrees.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Aucune entrée pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {pageCourante > 1 ? (
            <Link
              href={`/administration/journal?page=${pageCourante - 1}`}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
            >
              ← Précédent
            </Link>
          ) : (
            <span />
          )}
          <span className="text-slate-500">
            Page {pageCourante} sur {pages}
          </span>
          {pageCourante < pages ? (
            <Link
              href={`/administration/journal?page=${pageCourante + 1}`}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
            >
              Suivant →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
