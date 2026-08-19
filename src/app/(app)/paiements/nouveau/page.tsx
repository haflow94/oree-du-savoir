import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { creerDossierAction } from "./actions";
import { Champ, ChampSelect } from "@/components/ui/champ";
import { buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

const ERROR_MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Étudiant, année scolaire et montant dû sont obligatoires.",
};

export default async function NouveauDossierPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; etudiantId?: string }>;
}) {
  await requireRole([Role.ACCUEIL, Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU]);
  const { error, etudiantId } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  const [etudiants, annees] = await Promise.all([
    prisma.etudiant.findMany({ orderBy: [{ nom: "asc" }, { prenom: "asc" }] }),
    prisma.anneeScolaire.findMany({ orderBy: { libelle: "desc" } }),
  ]);

  const anneeParDefaut = annees.find((a) => a.active)?.id ?? annees[0]?.id;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-pine-strong">
          Nouveau dossier de paiement
        </h1>
        <p className="text-sm text-ink-muted">
          Le montant dû est saisi manuellement pour l&apos;instant (pas de
          tarification par cours dans le MVP).
        </p>
      </div>

      {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}

      {etudiants.length === 0 ? (
        <EmptyState
          message="Aucun étudiant enregistré."
          hint="Créez d'abord une fiche étudiant."
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
          <Champ label="Montant dû (€)" name="montantDu" type="number" step="0.01" min="0" required />
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
