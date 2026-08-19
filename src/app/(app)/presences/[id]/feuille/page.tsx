import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { peutAccederClasse } from "@/lib/acces-presence";
import { JOUR_LABELS } from "@/lib/planning";
import { STATUT_PRESENCE_CODES, STATUT_PRESENCE_LABELS } from "@/lib/presences";

/**
 * Feuille papier de secours, préremplie avec la liste des inscrits. Utilisée
 * quand le QR/l'application n'est pas disponible en séance ; l'administration
 * saisit ensuite la feuille dans l'application.
 */
export default async function FeuillePapierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const seance = await prisma.seance.findUnique({
    where: { id },
    include: {
      classe: {
        include: {
          cours: true,
          enseignants: { include: { utilisateur: true } },
          // Même filtre que la feuille en ligne (voir presences/[id]/page.tsx) :
          // liste d'attente et préinscriptions n'apparaissent pas ici non plus.
          inscriptions: {
            where: { statut: "CONFIRMEE", etudiant: { statutInscription: "VALIDE" } },
            include: { etudiant: true },
            orderBy: { etudiant: { nom: "asc" } },
          },
        },
      },
    },
  });

  if (!seance) {
    notFound();
  }

  if (!(await peutAccederClasse(session, seance.classeId))) {
    redirect("/acces-refuse");
  }

  const codes = Object.entries(STATUT_PRESENCE_CODES) as Array<
    [keyof typeof STATUT_PRESENCE_LABELS, string]
  >;

  return (
    <div className="mx-auto max-w-3xl space-y-5 print:max-w-none">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <p className="text-sm text-ink-muted">
          Imprimez cette feuille si l&apos;appel ne peut pas être fait dans
          l&apos;application. Elle sera ensuite saisie par l&apos;administration.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-bg-elevated p-6 print:rounded-none print:border-0 print:p-0">
        <h1 className="font-display text-lg font-bold text-pine-strong">
          Feuille de présence — {seance.classe.cours.nom}
          {seance.classe.niveau && ` (${seance.classe.niveau})`}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {JOUR_LABELS[seance.classe.jour]}{" "}
          {new Date(seance.date).toLocaleDateString("fr-FR")} ·{" "}
          {seance.classe.heureDebut}–{seance.classe.heureFin}
          {seance.classe.salle && ` · Salle ${seance.classe.salle}`}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Enseignant(s) :{" "}
          {seance.classe.enseignants.length > 0
            ? seance.classe.enseignants
                .map((e) => `${e.utilisateur.prenom} ${e.utilisateur.nom}`)
                .join(", ")
            : "—"}
        </p>

        <p className="mt-3 text-xs text-ink-faint">
          Codes : {codes.map(([k, c]) => `${c} = ${STATUT_PRESENCE_LABELS[k]}`).join(" · ")}
        </p>

        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-ink text-left">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">Nom</th>
              <th className="py-2 pr-2">Prénom</th>
              {codes.map(([, code]) => (
                <th key={code} className="w-12 py-2 text-center">
                  {code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {seance.classe.inscriptions.map((i, index) => (
              <tr key={i.id} className="border-b border-border-strong">
                <td className="py-2.5 pr-2 text-ink-faint">{index + 1}</td>
                <td className="py-2.5 pr-2 font-medium text-ink">{i.etudiant.nom}</td>
                <td className="py-2.5 pr-2 text-ink-muted">{i.etudiant.prenom}</td>
                {codes.map(([, code]) => (
                  <td key={code} className="py-2.5 text-center">
                    <span className="inline-block h-4 w-4 border border-ink-faint" />
                  </td>
                ))}
              </tr>
            ))}
            {seance.classe.inscriptions.length === 0 && (
              <tr>
                <td colSpan={3 + codes.length} className="py-6 text-center text-ink-faint">
                  Aucun étudiant inscrit.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-8 flex justify-end">
          <div className="w-64">
            <div className="border-b border-ink-faint pb-8" />
            <p className="mt-1 text-xs text-ink-muted">Signature de l&apos;enseignant</p>
          </div>
        </div>
      </div>
    </div>
  );
}
