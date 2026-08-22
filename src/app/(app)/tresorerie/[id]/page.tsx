import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import {
  MoyenPaiement,
  MOYEN_LABELS,
  TypeMouvement,
  TYPE_MOUVEMENT_LABELS,
} from "@/lib/paiements";
import { modifierMouvementAction, supprimerMouvementAction } from "../actions";
import { BackLink } from "@/components/ui/back-link";
import { Card } from "@/components/ui/card";
import { Champ, ChampSelect } from "@/components/ui/champ";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const PEUT_GERER = [Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU];

const MESSAGES: Record<string, string> = {
  CHAMPS_INVALIDES: "Tous les champs obligatoires doivent être renseignés.",
};

function versChampDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function MouvementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireRole(PEUT_GERER);
  const { id } = await params;
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const [mouvement, categories] = await Promise.all([
    prisma.mouvementTresorerie.findUnique({ where: { id } }),
    prisma.categorieMouvement.findMany({ orderBy: { nom: "asc" } }),
  ]);

  if (!mouvement) {
    notFound();
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <BackLink href="/tresorerie" label="Trésorerie" />
        <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">
          Modifier le mouvement
        </h1>
      </div>

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      <Card>
        <form action={modifierMouvementAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="mouvementId" value={mouvement.id} />
          <Champ
            label="Date"
            type="date"
            name="date"
            required
            defaultValue={versChampDate(mouvement.date)}
          />
          <Champ label="Libellé" name="libelle" required defaultValue={mouvement.libelle} />
          <ChampSelect label="Type" name="type" required defaultValue={mouvement.type}>
            {Object.values(TypeMouvement).map((t) => (
              <option key={t} value={t}>
                {TYPE_MOUVEMENT_LABELS[t]}
              </option>
            ))}
          </ChampSelect>
          <ChampSelect label="Moyen" name="moyen" required defaultValue={mouvement.moyen}>
            {Object.values(MoyenPaiement).map((m) => (
              <option key={m} value={m}>
                {MOYEN_LABELS[m]}
              </option>
            ))}
          </ChampSelect>
          <Champ
            label="Montant"
            type="number"
            step="0.01"
            min="0"
            name="montant"
            required
            defaultValue={mouvement.montant.toString()}
          />
          <ChampSelect label="Catégorie" name="categorieId" defaultValue={mouvement.categorieId ?? ""}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </ChampSelect>
          <Champ
            label="Justificatif (référence, optionnel)"
            name="justificatif"
            defaultValue={mouvement.justificatif ?? ""}
            className="sm:col-span-2"
          />
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" variant="primary">
              Enregistrer
            </Button>
          </div>
        </form>
      </Card>

      <div className="flex justify-end">
        <form id="supprimer-mouvement" action={supprimerMouvementAction}>
          <input type="hidden" name="mouvementId" value={mouvement.id} />
        </form>
        <ConfirmDialog
          formId="supprimer-mouvement"
          triggerLabel="Supprimer ce mouvement"
          title="Supprimer ce mouvement ?"
          description="Cette action supprime définitivement le mouvement et ne peut pas être annulée."
          confirmLabel="Supprimer définitivement"
        />
      </div>
    </div>
  );
}
