import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import {
  creerAnneeScolaireAction,
  modifierAnneeScolaireAction,
  activerAnneeScolaireAction,
} from "./actions";
import { Card, CardTitle } from "@/components/ui/card";
import { Champ } from "@/components/ui/champ";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

const MESSAGES: Record<string, string> = {
  CHAMPS_INVALIDES: "Libellé et dates sont obligatoires.",
  DATES_INVALIDES: "La date de fin doit être postérieure à la date de début.",
  LIBELLE_DEJA_UTILISE: "Une année scolaire porte déjà ce libellé.",
  INTROUVABLE: "Cette année scolaire n'existe plus.",
};

function versChampDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function AnneesScolairesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireRole([Role.ADMINISTRATION, Role.BUREAU]);
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const annees = await prisma.anneeScolaire.findMany({
    orderBy: { dateDebut: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/administration" className="text-sm text-ink-muted hover:underline">
          ← Administration
        </Link>
        <h1 className="mt-1 font-display text-2xl font-semibold text-pine-strong">
          Années scolaires
        </h1>
        <p className="text-sm text-ink-muted">
          Une seule année est active à la fois : c&apos;est elle qui sert de
          référence par défaut pour les nouvelles classes et dossiers.
        </p>
      </div>

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      <Card>
        <CardTitle>Créer une année scolaire</CardTitle>
        <form action={creerAnneeScolaireAction} className="mt-3 grid gap-3 sm:grid-cols-4">
          <Champ
            label="Libellé"
            name="libelle"
            id="libelle-nouvelle"
            required
            placeholder="ex. 2026/2027"
          />
          <Champ label="Date de début" name="dateDebut" id="dateDebut-nouvelle" type="date" required />
          <Champ label="Date de fin" name="dateFin" id="dateFin-nouvelle" type="date" required />
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" name="activer" value="1" />
              Activer immédiatement
            </label>
          </div>
          <div className="flex justify-end sm:col-span-4">
            <Button type="submit" variant="primary">
              Créer l&apos;année scolaire
            </Button>
          </div>
        </form>
      </Card>

      <div className="space-y-3">
        {annees.map((a) => (
          <Card key={a.id} className={a.active ? "border-sage-border" : ""}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="font-medium text-ink">
                {a.libelle}
                {a.active && (
                  <span className="ml-2">
                    <Badge variant="success">Active</Badge>
                  </span>
                )}
              </div>
              {!a.active && (
                <form action={activerAnneeScolaireAction}>
                  <input type="hidden" name="anneeId" value={a.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-sage-border px-3 py-1.5 text-xs font-semibold text-sage hover:bg-sage-bg"
                  >
                    Activer
                  </button>
                </form>
              )}
            </div>

            <form action={modifierAnneeScolaireAction} className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="anneeId" value={a.id} />
              <Champ
                label="Libellé"
                name="libelle"
                id={`libelle-${a.id}`}
                required
                defaultValue={a.libelle}
              />
              <Champ
                label="Date de début"
                name="dateDebut"
                id={`dateDebut-${a.id}`}
                type="date"
                required
                defaultValue={versChampDate(a.dateDebut)}
              />
              <Champ
                label="Date de fin"
                name="dateFin"
                id={`dateFin-${a.id}`}
                type="date"
                required
                defaultValue={versChampDate(a.dateFin)}
              />
              <div className="flex justify-end sm:col-span-3">
                <Button type="submit" variant="secondary">
                  Enregistrer
                </Button>
              </div>
            </form>
          </Card>
        ))}
        {annees.length === 0 && <EmptyState message="Aucune année scolaire enregistrée." />}
      </div>
    </div>
  );
}
