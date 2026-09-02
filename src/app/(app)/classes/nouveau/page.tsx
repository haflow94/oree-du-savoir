import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";
import { enseignantsActifsAvecSections } from "@/lib/enseignants";
import { NouvelleClasseForm } from "./nouvelle-classe-form";
import { BackLink } from "@/components/ui/back-link";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

const ERROR_MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Cohorte, cours, année et horaires sont obligatoires.",
  CLASSE_DEJA_EXISTANTE:
    "Une classe identique (même cohorte, cours et session) existe déjà pour cette année scolaire.",
  COURS_HORS_COHORTE: "Ce cours n'appartient pas à la cohorte choisie.",
};

export default async function NouvelleClassePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; depuis?: string }>;
}) {
  await requireModule(Module.CLASSES, "ECRITURE");
  const { error, depuis } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  const [cohortesBrutes, annees, enseignants, source, salles] = await Promise.all([
    prisma.cohorte.findMany({
      include: {
        section: { select: { id: true, nom: true } },
        coursLies: {
          include: { cours: { select: { id: true, nom: true, sectionId: true } } },
          orderBy: { ordre: "asc" },
        },
      },
      orderBy: [{ section: { nom: "asc" } }, { niveau: "asc" }, { jour: "asc" }],
    }),
    prisma.anneeScolaire.findMany({ orderBy: { libelle: "desc" } }),
    enseignantsActifsAvecSections(),
    depuis
      ? prisma.classe.findUnique({
          where: { id: depuis },
          include: { cohorte: true, cours: true },
        })
      : Promise.resolve(null),
    prisma.salle.findMany({ orderBy: { nom: "asc" }, select: { id: true, nom: true } }),
  ]);

  const cohortes = cohortesBrutes.map((c) => ({
    id: c.id,
    section: c.section,
    niveau: c.niveau,
    jour: c.jour,
    cours: c.coursLies.map((cl) => cl.cours),
  }));

  const anneeParDefaut = source?.anneeScolaireId ?? annees.find((a) => a.active)?.id ?? annees[0]?.id;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <BackLink href="/classes" label="Classes" />
        <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">
          {source ? "Dupliquer une classe" : "Nouvelle classe"}
        </h1>
        <p className="text-sm text-ink-muted">
          {source
            ? `Copie de « ${source.cours.nom}${source.cohorte.niveau ? ` — ${source.cohorte.niveau}` : ""} ». Aucun étudiant ni enseignant n'est repris : modifiez ce qui change (créneau, salle…), choisissez l'enseignant, puis validez.`
            : "Une cohorte doit exister au préalable (voir la page Classes)."}
        </p>
      </div>

      {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}

      {cohortes.length === 0 ? (
        <EmptyState
          message="Aucune cohorte enregistrée."
          hint="Créez d'abord une cohorte depuis la page Classes, puis revenez ici."
        />
      ) : (
        <NouvelleClasseForm
          cohortes={cohortes}
          annees={annees}
          enseignants={enseignants}
          source={
            source && {
              cohorteId: source.cohorteId,
              coursId: source.coursId,
              semestre: source.semestre,
              heureDebut: source.heureDebut,
              heureFin: source.heureFin,
              salleId: source.salleId,
            }
          }
          anneeParDefaut={anneeParDefaut}
          salles={salles}
        />
      )}
    </div>
  );
}
