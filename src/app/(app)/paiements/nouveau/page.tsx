import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formaterMontant } from "@/lib/paiements";
import { requireModule, peutAccederModule, Module } from "@/lib/permissions";
import { tarifSuggereDossier } from "@/lib/sections-etudiant";
import { JOUR_LABELS } from "@/lib/planning";
import { creerDossierAction } from "./actions";
import { Champ, ChampSelect, CONTROL_CLASSES } from "@/components/ui/champ";
import { buttonVariants } from "@/components/ui/button";
import { SubmitMontantDu } from "@/components/ui/submit-montant-du";
import { BackLink } from "@/components/ui/back-link";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

const ERROR_MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Étudiant, année scolaire et montant dû sont obligatoires.",
  COHORTE_INTROUVABLE: "Cette cohorte n'existe plus.",
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
  const session = await requireModule(Module.PAIEMENTS, "ECRITURE");
  const { error, etudiantId, anneeScolaireId, q } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;
  const recherche = q?.trim() ?? "";
  // Revient à la fiche d'origine quand on y a accès (voir même logique dans
  // paiements/[id]/page.tsx) plutôt que toujours vers la liste générique.
  const peutVoirEtudiant =
    !!etudiantId && (await peutAccederModule(session.role, Module.ETUDIANTS, "LECTURE"));
  const retourHref = peutVoirEtudiant ? `/etudiants/${etudiantId}` : "/paiements";

  const [etudiants, annees, cohortesBrutes] = await Promise.all([
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
    prisma.cohorte.findMany({
      include: {
        section: { select: { id: true, nom: true } },
        coursLies: { include: { cours: true }, orderBy: { ordre: "asc" } },
      },
      orderBy: [{ section: { nom: "asc" } }, { niveau: "asc" }, { jour: "asc" }],
    }),
  ]);

  const anneeParDefaut = anneeScolaireId ?? annees.find((a) => a.active)?.id ?? annees[0]?.id;
  // Suggestion calculée seulement quand on arrive avec un étudiant déjà
  // choisi (depuis sa fiche) : elle ne peut pas se recalculer sans rechargt
  // de page si le staff change le select ensuite, donc pas de suggestion
  // trompeuse affichée dans ce cas — juste le champ vide comme avant.
  const tarifSuggere =
    etudiantId && anneeParDefaut
      ? await tarifSuggereDossier(etudiantId, anneeParDefaut)
      : null;

  // Occupation actuelle par Cohorte, sur l'année par défaut (comme pour
  // tarifSuggere ci-dessus : pas de recalcul dynamique si le staff change
  // le select Année ensuite, juste un aperçu au chargement).
  const affectesParCohorte = anneeParDefaut
    ? await prisma.affectationCohorte.groupBy({
        by: ["cohorteId"],
        where: { anneeScolaireId: anneeParDefaut, statut: "AFFECTE" },
        _count: { _all: true },
      })
    : [];
  const compteAffectesParCohorteId = new Map(
    affectesParCohorte.map((a) => [a.cohorteId, a._count._all]),
  );

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <BackLink
          href={retourHref}
          label={peutVoirEtudiant ? "Retour à la fiche" : "Paiements"}
        />
        <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">
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
            defaultValue={tarifSuggere?.total ?? undefined}
            hint={
              tarifSuggere
                ? `Suggéré depuis les sections suivies : formation ${formaterMontant(tarifSuggere.formation)} + dossier (unique) ${formaterMontant(tarifSuggere.dossier)} = ${formaterMontant(tarifSuggere.total)} — modifiable.`
                : undefined
            }
          />
          <ChampSelect
            label="Affecter à une cohorte (optionnel)"
            name="cohorteId"
            defaultValue=""
            hint="Inscrit automatiquement l'étudiant à toutes les classes du bloc si une place est disponible, sinon le met en liste d'attente."
          >
            <option value="">Aucune affectation immédiate</option>
            {cohortesBrutes.map((c) => {
              const compte = compteAffectesParCohorteId.get(c.id) ?? 0;
              const occupation =
                c.capaciteMax !== null
                  ? ` · ${compte}/${c.capaciteMax}${compte >= c.capaciteMax ? " (complet, liste d'attente)" : ""}`
                  : "";
              return (
                <option key={c.id} value={c.id}>
                  {c.section.nom}
                  {c.niveau ? ` — ${c.niveau}` : ""} ({JOUR_LABELS[c.jour]}){occupation}
                </option>
              );
            })}
          </ChampSelect>
          <div className="flex justify-end gap-3">
            <Link href={retourHref} className={buttonVariants({ variant: "secondary" })}>
              Annuler
            </Link>
            <SubmitMontantDu
              montantInputId="montantDu"
              montantSuggere={tarifSuggere?.total ?? null}
              pendingLabel="Création…"
            >
              Créer le dossier
            </SubmitMontantDu>
          </div>
        </form>
      )}
    </div>
  );
}
