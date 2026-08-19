import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { JOURS_ORDONNES, JOUR_LABELS } from "@/lib/planning";
import { creerClasseAction } from "./actions";
import { Champ, ChampSelect } from "@/components/ui/champ";
import { buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

const ERROR_MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Cours, année, jour et horaires sont obligatoires.",
};
const FIELDSET_CLASSES = "rounded-xl border border-border bg-bg-elevated p-5 shadow-card";
const LEGEND_CLASSES = "px-1 text-sm font-semibold text-ink";

export default async function NouvelleClassePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole([Role.ADMINISTRATION, Role.BUREAU]);
  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  const [cours, annees, enseignants] = await Promise.all([
    prisma.cours.findMany({ orderBy: { nom: "asc" } }),
    prisma.anneeScolaire.findMany({ orderBy: { libelle: "desc" } }),
    prisma.utilisateur.findMany({
      where: { role: Role.ENSEIGNANT, actif: true },
      orderBy: [{ nom: "asc" }],
    }),
  ]);

  const anneeParDefaut = annees.find((a) => a.active)?.id ?? annees[0]?.id;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-pine-strong">
          Nouvelle classe
        </h1>
        <p className="text-sm text-ink-muted">
          Un cours doit exister au préalable (voir la page Classes).
        </p>
      </div>

      {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}

      {cours.length === 0 ? (
        <EmptyState
          message="Aucun cours enregistré."
          hint="Créez d'abord un cours depuis la page Classes, puis revenez ici."
        />
      ) : (
        <form action={creerClasseAction} className="space-y-6">
          <fieldset className={FIELDSET_CLASSES}>
            <legend className={LEGEND_CLASSES}>Cours et niveau</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <ChampSelect label="Cours" name="coursId" required>
                {cours.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
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
              <Champ label="Niveau" name="niveau" placeholder="ex. Débutant, CM1…" />
              <ChampSelect label="Semestre (optionnel)" name="semestre" defaultValue="">
                <option value="">Toute l&apos;année</option>
                <option value="1">Semestre 1</option>
                <option value="2">Semestre 2</option>
              </ChampSelect>
            </div>
          </fieldset>

          <fieldset className={FIELDSET_CLASSES}>
            <legend className={LEGEND_CLASSES}>Créneau</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <ChampSelect label="Jour" name="jour" required>
                {JOURS_ORDONNES.map((j) => (
                  <option key={j} value={j}>
                    {JOUR_LABELS[j]}
                  </option>
                ))}
              </ChampSelect>
              <Champ label="Heure de début" name="heureDebut" type="time" required />
              <Champ label="Heure de fin" name="heureFin" type="time" required />
            </div>
          </fieldset>

          <fieldset className={FIELDSET_CLASSES}>
            <legend className={LEGEND_CLASSES}>Salle et capacité</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ label="Salle" name="salle" />
              <Champ label="Capacité" name="capacite" type="number" min={0} />
            </div>
          </fieldset>

          <fieldset className={FIELDSET_CLASSES}>
            <legend className={LEGEND_CLASSES}>Enseignant(s)</legend>
            {enseignants.length === 0 ? (
              <p className="text-sm text-ink-faint">
                Aucun compte avec le rôle Enseignant pour l&apos;instant (voir
                Administration → Enseignants).
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {enseignants.map((e) => (
                  <label
                    key={e.id}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink-muted"
                  >
                    <input type="checkbox" name="enseignants" value={e.id} />
                    {e.prenom} {e.nom}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="flex justify-end gap-3">
            <Link href="/classes" className={buttonVariants({ variant: "secondary" })}>
              Annuler
            </Link>
            <button type="submit" className={buttonVariants({ variant: "primary" })}>
              Créer la classe
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
