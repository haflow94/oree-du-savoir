import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { peutAccederClasse } from "@/lib/acces-presence";
import { JOUR_LABELS } from "@/lib/planning";
import { chargerSeanceAvecAppel } from "@/lib/appel";
import { FeuilleAppel } from "@/app/(app)/presences/[id]/feuille-appel";
import { Alert } from "@/components/ui/alert";
import { QuitterButton } from "@/components/ui/quitter-button";

const MESSAGES: Record<string, string> = {
  SEANCE_INDISPONIBLE: "Cette séance est annulée ou introuvable.",
  ACCES_REFUSE: "Vous n'avez pas accès à cette classe.",
  DELAI_CORRECTION_DEPASSE:
    "Le délai de correction est dépassé : contactez l'administration.",
  SAISIE_INCOMPLETE:
    "Merci de renseigner un statut pour chaque étudiant inscrit avant de valider : aucune présence n'a été enregistrée.",
};

// Destination unique de la connexion faite en scannant le QR d'une classe
// (voir /qr/[token] et requireSession dans src/lib/auth.ts) : volontairement
// HORS du layout (app) — jamais de sidebar, jamais de topbar, jamais de lien
// vers une autre page, quel que soit le rôle de la personne connectée. Le
// seul moyen de sortir d'ici est le bouton Déconnexion.
export default async function AppelPage({
  params,
  searchParams,
}: {
  params: Promise<{ seanceId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { seanceId } = await params;
  const { error } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;
  const session = await requireSession({ allowedSeanceId: seanceId });

  const donnees = await chargerSeanceAvecAppel(seanceId, session);
  if (!donnees) {
    notFound();
  }
  const { seance, lignes, verrouillee } = donnees;

  if (!(await peutAccederClasse(session, seance.classeId))) {
    redirect("/acces-refuse");
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-bg">
      <header className="flex items-center justify-between border-b border-border bg-bg-elevated px-4 py-3">
        <span className="font-display text-sm font-semibold text-pine-strong">
          L&apos;Orée du Savoir — Appel du jour
        </span>
        <QuitterButton className="rounded-md border border-border px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-bg-sunken" />
      </header>

      <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-pine-strong">
              {seance.classe.cohorte.cours.nom}
              {seance.classe.cohorte.niveau && ` — ${seance.classe.cohorte.niveau}`}
            </h1>
            <p className="text-sm text-ink-muted">
              {JOUR_LABELS[seance.classe.cohorte.jour]}{" "}
              {new Date(seance.date).toLocaleDateString("fr-FR")} ·{" "}
              {seance.classe.heureDebut}–{seance.classe.heureFin}
              {seance.classe.salle && ` · ${seance.classe.salle.nom}`}
            </p>
          </div>

          {message && <Alert variant="danger">{message}</Alert>}

          {seance.statut === "ANNULEE" ? (
            <Alert variant="warning">
              Cette séance a été annulée
              {seance.motifAnnulation ? ` (${seance.motifAnnulation})` : ""}.
            </Alert>
          ) : (
            <>
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

              <FeuilleAppel
                seanceId={seance.id}
                lignes={lignes}
                lectureSeule={verrouillee}
                dejaValidee={seance.statut === "VALIDEE"}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
