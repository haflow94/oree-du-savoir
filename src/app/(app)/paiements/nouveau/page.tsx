import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { formaterMontant } from "@/lib/paiements";
import { montantSuggereDossier } from "@/lib/sections-etudiant";
import { creerDossierAction } from "./actions";
import { Champ, ChampSelect, CONTROL_CLASSES } from "@/components/ui/champ";
import { buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

const ERROR_MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Étudiant, année scolaire et montant dû sont obligatoires.",
};

export default async function NouveauDossierPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    etudiantId?: string;
    anneeScolaireId?: string;
    q?: string;
  }>;
}) {
  await requireRole([Role.ACCUEIL, Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU]);
  const { error, etudiantId, anneeScolaireId, q } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;
  const recherche = q?.trim() ?? "";

  const [etudiants, annees] = await Promise.all([
    // Recherche par nom/prénom : indispensable dès qu'il y a plus qu'une
    // poignée d'étudiants (le <select> seul devient vite ingérable).
    prisma.etudiant.findMany({
      where: recherche
        ? {
            OR: [
              { nom: { contains: recherche, mode: "insensitive" } },
              { prenom: { contains: recherche, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    }),
    prisma.anneeScolaire.findMany({ orderBy: { libelle: "desc" } }),
  ]);

  const anneeParDefaut = anneeScolaireId ?? annees.find((a) => a.active)?.id ?? annees[0]?.id;
  // Suggestion calculée seulement quand on arrive avec un étudiant déjà
  // choisi (depuis sa fiche) : elle ne peut pas se recalculer sans rechargt
  // de page si le staff change le select ensuite, donc pas de suggestion
  // trompeuse affichée dans ce cas — juste le champ vide comme avant.
  const montantSuggere =
    etudiantId && anneeParDefaut
      ? await montantSuggereDossier(etudiantId, anneeParDefaut)
      : null;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-pine-strong">
          Nouveau dossier de paiement
        </h1>
        <p className="text-sm text-ink-muted">
          Le montant dû est pré-rempli à partir des tarifs des sections
          suivies quand on le connaît, mais reste modifiable : la décision
          finale revient toujours au staff.
        </p>
      </div>

      {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}

      <form className="flex gap-2" action="/paiements/nouveau" method="GET">
        {etudiantId && <input type="hidden" name="etudiantId" value={etudiantId} />}
        <input
          type="search"
          name="q"
          defaultValue={recherche}
          placeholder="Filtrer les étudiants par nom ou prénom…"
          className={`w-full ${CONTROL_CLASSES}`}
        />
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          Filtrer
        </button>
      </form>

      {etudiants.length === 0 ? (
        <EmptyState
          message={
            recherche ? "Aucun étudiant ne correspond à cette recherche." : "Aucun étudiant enregistré."
          }
          hint={recherche ? undefined : "Créez d'abord une fiche étudiant."}
        />
      ) : (
        <form
          action={creerDossierAction}
          className="space-y-4 rounded-xl border border-border bg-bg-elevated p-5 shadow-card"
        >
          <ChampSelect label="Étudiant" name="etudiantId" required defaultValue={etudiantId}>
            {etudiants.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom} {e.prenom}
              </option>
            ))}
          </ChampSelect>
          <ChampSelect
            label="Année scolaire"
            name="anneeScolaireId"
            required
            defaultValue={anneeParDefaut}
          >
            {annees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.libelle}
                {a.active ? " (active)" : ""}
              </option>
            ))}
          </ChampSelect>
          <Champ
            label="Montant dû (€)"
            name="montantDu"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={montantSuggere ?? undefined}
            hint={
              montantSuggere !== null
                ? `Suggéré depuis les sections suivies (${formaterMontant(montantSuggere)}) — modifiable.`
                : undefined
            }
          />
          <div className="flex justify-end gap-3">
            <Link href="/paiements" className={buttonVariants({ variant: "secondary" })}>
              Annuler
            </Link>
            <button type="submit" className={buttonVariants({ variant: "primary" })}>
              Créer le dossier
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
