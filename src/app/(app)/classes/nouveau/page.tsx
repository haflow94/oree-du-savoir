import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";
import { enseignantsActifsAvecSections } from "@/lib/enseignants";
import { NouvelleClasseForm } from "./nouvelle-classe-form";
import { BackLink } from "@/components/ui/back-link";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

const ERROR_MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Cours, année, jour et horaires sont obligatoires.",
  CLASSE_DEJA_EXISTANTE:
    "Une classe identique (même cours, niveau et session) existe déjà pour cette année scolaire.",
};

export default async function NouvelleClassePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; depuis?: string }>;
}) {
  await requireModule(Module.CLASSES, "ECRITURE");
  const { error, depuis } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  const [cours, annees, enseignants, source, sallesDistinctes] = await Promise.all([
    prisma.cours.findMany({ orderBy: { nom: "asc" } }),
    prisma.anneeScolaire.findMany({ orderBy: { libelle: "desc" } }),
    enseignantsActifsAvecSections(),
    depuis
      ? prisma.classe.findUnique({
          where: { id: depuis },
          include: { cours: true },
        })
      : Promise.resolve(null),
    // Salles déjà utilisées, proposées via un <datalist> dans le formulaire :
    // pas de référentiel Salle séparé, mais un typo casse le rapprochement du
    // QR de salle (voir src/lib/qr.ts) — réduit ce risque sans bloquer la
    // saisie d'une salle réellement nouvelle.
    prisma.classe.findMany({
      where: { salle: { not: null } },
      distinct: ["salle"],
      select: { salle: true },
      orderBy: { salle: "asc" },
    }),
  ]);

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
            ? `Copie de « ${source.cours.nom}${source.niveau ? ` — ${source.niveau}` : ""} ». Aucun étudiant ni enseignant n'est repris : modifiez ce qui change (créneau, salle…), choisissez l'enseignant, puis validez.`
            : "Un cours doit exister au préalable (voir la page Classes)."}
        </p>
      </div>

      {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}

      {cours.length === 0 ? (
        <EmptyState
          message="Aucun cours enregistré."
          hint="Créez d'abord un cours depuis la page Classes, puis revenez ici."
        />
      ) : (
        <NouvelleClasseForm
          cours={cours}
          annees={annees}
          enseignants={enseignants}
          source={source}
          anneeParDefaut={anneeParDefaut}
          salles={sallesDistinctes.flatMap((s) => (s.salle ? [s.salle] : []))}
        />
      )}
    </div>
  );
}
