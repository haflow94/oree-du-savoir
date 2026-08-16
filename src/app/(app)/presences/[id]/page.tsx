import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { peutAccederClasse, estAdministratif } from "@/lib/acces-presence";
import { JOUR_LABELS } from "@/lib/planning";
import { enseignantPeutCorriger } from "@/lib/presences";
import { annulerSeanceAction } from "../actions";
import { FeuilleAppel, type LigneAppel } from "./feuille-appel";

export default async function SeancePage({
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
          inscriptions: {
            include: { etudiant: true },
            orderBy: { etudiant: { nom: "asc" } },
          },
        },
      },
      presences: true,
      valideePar: true,
    },
  });

  if (!seance) {
    notFound();
  }

  if (!(await peutAccederClasse(session, seance.classeId))) {
    redirect("/acces-refuse");
  }

  const administratif = estAdministratif(session.role);
  const verrouillee =
    seance.statut === "VALIDEE" &&
    !administratif &&
    !enseignantPeutCorriger(seance.date);

  const parEtudiant = new Map(seance.presences.map((p) => [p.etudiantId, p.statut]));
  const lignes: LigneAppel[] = seance.classe.inscriptions.map((i) => ({
    etudiantId: i.etudiantId,
    nom: i.etudiant.nom,
    prenom: i.etudiant.prenom,
    statutInitial: parEtudiant.get(i.etudiantId) ?? null,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/presences" className="text-sm text-slate-500 hover:underline">
          ← Présences
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">
          {seance.classe.cours.nom}
          {seance.classe.niveau && ` — ${seance.classe.niveau}`}
        </h2>
        <p className="text-sm text-slate-500">
          {JOUR_LABELS[seance.classe.jour]}{" "}
          {new Date(seance.date).toLocaleDateString("fr-FR")} ·{" "}
          {seance.classe.heureDebut}–{seance.classe.heureFin}
          {seance.classe.salle && ` · ${seance.classe.salle}`}
        </p>
      </div>

      {seance.statut === "VALIDEE" && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Appel validé
          {seance.valideeLe &&
            ` le ${new Date(seance.valideeLe).toLocaleString("fr-FR")}`}
          {seance.valideePar &&
            ` par ${seance.valideePar.prenom} ${seance.valideePar.nom}`}
          {seance.saisieViaPapier && " (saisi depuis la feuille papier)"}.
          {verrouillee &&
            " Le délai de correction est dépassé : contactez l'administration."}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/presences/${seance.id}/feuille`}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Feuille papier (secours)
        </Link>
      </div>

      <FeuilleAppel
        seanceId={seance.id}
        lignes={lignes}
        lectureSeule={verrouillee}
        dejaValidee={seance.statut === "VALIDEE"}
      />

      {administratif && seance.statut !== "ANNULEE" && (
        <form
          action={annulerSeanceAction}
          className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <input type="hidden" name="seanceId" value={seance.id} />
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Annuler cette séance (motif)
            </label>
            <input
              type="text"
              name="motifAnnulation"
              placeholder="ex. enseignant absent, jour férié"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Annuler la séance
          </button>
        </form>
      )}
    </div>
  );
}
