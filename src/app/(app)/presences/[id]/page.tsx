import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { peutAccederClasse, estAdministratif } from "@/lib/acces-presence";
import { JOUR_LABELS } from "@/lib/planning";
import { enseignantPeutCorriger } from "@/lib/presences";
import { annulerSeanceAction } from "../actions";
import { FeuilleAppel, type LigneAppel } from "./feuille-appel";
import { buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

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
          // Seuls les étudiants avec une place confirmée et un dossier validé
          // font l'appel (voir src/lib/inscriptions.ts) : une préinscription
          // ou une liste d'attente n'apparaît jamais en présences.
          inscriptions: {
            where: { statut: "CONFIRMEE", etudiant: { statutInscription: "VALIDE" } },
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
        <Link href="/presences" className="text-sm text-ink-muted hover:underline">
          ← Présences
        </Link>
        <h1 className="mt-1 font-display text-2xl font-semibold text-pine-strong">
          {seance.classe.cours.nom}
          {seance.classe.niveau && ` — ${seance.classe.niveau}`}
        </h1>
        <p className="text-sm text-ink-muted">
          {JOUR_LABELS[seance.classe.jour]}{" "}
          {new Date(seance.date).toLocaleDateString("fr-FR")} ·{" "}
          {seance.classe.heureDebut}–{seance.classe.heureFin}
          {seance.classe.salle && ` · ${seance.classe.salle}`}
        </p>
      </div>

      {seance.statut === "VALIDEE" && (
        <Alert variant="success">
          Appel validé
          {seance.valideeLe &&
            ` le ${new Date(seance.valideeLe).toLocaleString("fr-FR")}`}
          {seance.valideePar &&
            ` par ${seance.valideePar.prenom} ${seance.valideePar.nom}`}
          {seance.saisieViaPapier && " (saisi depuis la feuille papier)"}.
          {verrouillee &&
            " Le délai de correction est dépassé : contactez l'administration."}
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/presences/${seance.id}/feuille`}
          className={buttonVariants({ variant: "secondary" })}
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
          className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-bg-elevated p-4 shadow-card"
        >
          <input type="hidden" name="seanceId" value={seance.id} />
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Annuler cette séance (motif)
            </label>
            <input
              type="text"
              name="motifAnnulation"
              placeholder="ex. enseignant absent, jour férié"
              className="w-full rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft"
            />
          </div>
          <button type="submit" className={buttonVariants({ variant: "danger" })}>
            Annuler la séance
          </button>
        </form>
      )}
    </div>
  );
}
