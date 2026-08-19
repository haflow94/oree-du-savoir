import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MoyenPaiement,
  MOYEN_LABELS,
  TypeMouvement,
  TYPE_MOUVEMENT_LABELS,
  formaterMontant,
} from "@/lib/paiements";
import { Role, hasRole } from "@/lib/roles";
import {
  creerCategorieAction,
  modifierCategorieAction,
  changerActivationCategorieAction,
  creerMouvementAction,
} from "./actions";
import { Card, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableWrap, TableHead } from "@/components/ui/table";

const PEUT_GERER = [Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU];
const CONTROL_CLASSES =
  "w-full rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";
const CONTROL_SM_CLASSES =
  "w-full rounded-md border border-border-strong bg-bg-elevated px-2 py-1.5 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";
const LABEL_XS_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

export default async function TresoreriePage() {
  const session = await requireSession();
  const peutGerer = hasRole(session.role, PEUT_GERER);

  const [mouvements, toutesCategories] = await Promise.all([
    prisma.mouvementTresorerie.findMany({
      orderBy: [{ date: "asc" }, { creeLe: "asc" }],
      include: { categorie: true },
    }),
    prisma.categorieMouvement.findMany({
      orderBy: { nom: "asc" },
    }),
  ]);
  const categoriesActives = toutesCategories.filter((c) => c.actif);
  const categories = peutGerer ? toutesCategories : categoriesActives;

  const lignes = mouvements.reduce<
    Array<{
      id: string;
      date: Date;
      libelle: string;
      type: (typeof mouvements)[number]["type"];
      moyen: (typeof mouvements)[number]["moyen"];
      categorieNom: string | null;
      montant: number;
      soldeCumule: number;
    }>
  >((acc, m) => {
    const montant = Number.parseFloat(m.montant.toString());
    const precedent = acc.at(-1)?.soldeCumule ?? 0;
    acc.push({
      id: m.id,
      date: m.date,
      libelle: m.libelle,
      type: m.type,
      moyen: m.moyen,
      categorieNom: m.categorie?.nom ?? null,
      montant,
      soldeCumule: precedent + (m.type === "RECETTE" ? montant : -montant),
    });
    return acc;
  }, []);
  const solde = lignes.at(-1)?.soldeCumule ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-pine-strong">Trésorerie</h1>
          <p className="text-sm text-ink-muted">
            Mouvements recette/dépense, solde calculé en cumul. Volontairement
            simple : pas de comptabilité complète.
          </p>
        </div>
        <form action="/tresorerie/export" method="GET" className="flex flex-wrap items-end gap-2">
          <div>
            <label className={LABEL_XS_CLASSES}>Du</label>
            <input type="date" name="dateDebut" className={CONTROL_CLASSES} />
          </div>
          <div>
            <label className={LABEL_XS_CLASSES}>Au</label>
            <input type="date" name="dateFin" className={CONTROL_CLASSES} />
          </div>
          <button type="submit" className={buttonVariants({ variant: "secondary" })}>
            Exporter en CSV
          </button>
        </form>
      </div>

      {/* Sur mobile (grid-cols-1), l'ordre DOM place le tableau avant les
          formulaires (order-1/order-2) ; à partir de lg, la grille à deux
          colonnes replace les formulaires à gauche, tableau à droite —
          toujours visible sans avoir à faire défiler devant les formulaires. */}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="order-2 space-y-6 lg:order-1">
          <Card className="p-4">
            <div className="text-xs uppercase text-ink-faint">Solde actuel</div>
            <div className="mt-1 text-2xl font-bold text-ink">{formaterMontant(solde)}</div>
          </Card>

          <Card>
            <CardTitle>Catégories</CardTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.length === 0 && (
                <p className="text-sm text-ink-faint">Aucune catégorie enregistrée.</p>
              )}
              {categories.map((c) =>
                peutGerer ? (
                  <details
                    key={c.id}
                    className={`rounded-lg border border-border px-3 py-1.5 ${c.actif ? "" : "opacity-50"}`}
                  >
                    <summary className="cursor-pointer text-sm text-ink-muted">
                      {c.nom}
                      {!c.actif && <span className="ml-1 text-xs text-ink-faint">(désactivée)</span>}
                    </summary>
                    <form action={modifierCategorieAction} className="mt-3 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="categorieId" value={c.id} />
                      <input name="nom" required defaultValue={c.nom} className={CONTROL_SM_CLASSES} />
                      <Button type="submit" variant="secondary" size="sm">
                        Renommer
                      </Button>
                    </form>
                    <form action={changerActivationCategorieAction} className="mt-2">
                      <input type="hidden" name="categorieId" value={c.id} />
                      <input type="hidden" name="actif" value={c.actif ? "0" : "1"} />
                      <button type="submit" className="text-xs font-medium text-ink-muted hover:underline">
                        {c.actif ? "Désactiver" : "Réactiver"}
                      </button>
                    </form>
                  </details>
                ) : (
                  <Badge key={c.id} variant="neutral">
                    {c.nom}
                  </Badge>
                ),
              )}
            </div>
            {peutGerer && (
              <form action={creerCategorieAction} className="mt-4 flex flex-col gap-2">
                <input
                  type="text"
                  name="nom"
                  required
                  placeholder="Nom de la nouvelle catégorie"
                  className={CONTROL_CLASSES}
                />
                <Button type="submit" variant="secondary">
                  Ajouter
                </Button>
              </form>
            )}
          </Card>

          {peutGerer && (
            <details className="rounded-xl border border-border bg-bg-elevated p-5 shadow-card">
              <summary className="cursor-pointer text-sm font-semibold text-ink">
                + Nouveau mouvement
              </summary>
              <form action={creerMouvementAction} className="mt-4 flex flex-col gap-3">
                <div>
                  <label className={LABEL_XS_CLASSES}>Date</label>
                  <input type="date" name="date" required className={CONTROL_CLASSES} />
                </div>
                <div>
                  <label className={LABEL_XS_CLASSES}>Libellé</label>
                  <input type="text" name="libelle" required className={CONTROL_CLASSES} />
                </div>
                <div>
                  <label className={LABEL_XS_CLASSES}>Type</label>
                  <select name="type" required className={CONTROL_CLASSES}>
                    {Object.values(TypeMouvement).map((t) => (
                      <option key={t} value={t}>
                        {TYPE_MOUVEMENT_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL_XS_CLASSES}>Moyen</label>
                  <select name="moyen" required className={CONTROL_CLASSES}>
                    {Object.values(MoyenPaiement).map((m) => (
                      <option key={m} value={m}>
                        {MOYEN_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL_XS_CLASSES}>Montant</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="montant"
                    required
                    className={CONTROL_CLASSES}
                  />
                </div>
                <div>
                  <label className={LABEL_XS_CLASSES}>Catégorie</label>
                  <select name="categorieId" className={CONTROL_CLASSES}>
                    <option value="">—</option>
                    {categoriesActives.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL_XS_CLASSES}>Justificatif (référence, optionnel)</label>
                  <input
                    type="text"
                    name="justificatif"
                    placeholder="ex. nom du fichier scanné"
                    className={CONTROL_CLASSES}
                  />
                </div>
                <Button type="submit" variant="primary">
                  Enregistrer
                </Button>
              </form>
            </details>
          )}
        </div>

        <div className="order-1 lg:order-2">
          <TableWrap>
            <TableHead>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Libellé</th>
              <th className="px-4 py-3">Catégorie</th>
              <th className="px-4 py-3">Moyen</th>
              <th className="px-4 py-3">Montant</th>
              <th className="px-4 py-3">Solde</th>
            </TableHead>
            <tbody className="divide-y divide-border">
              {lignes.map((m) => (
                <tr key={m.id} className="hover:bg-bg-sunken/40">
                  <td className="px-4 py-3 text-ink-muted">
                    {new Date(m.date).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">
                    {peutGerer ? (
                      <Link href={`/tresorerie/${m.id}`} className="hover:underline">
                        {m.libelle}
                      </Link>
                    ) : (
                      m.libelle
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{m.categorieNom ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-muted">{MOYEN_LABELS[m.moyen]}</td>
                  <td
                    className={`px-4 py-3 font-medium ${
                      m.type === "RECETTE" ? "text-sage" : "text-rust"
                    }`}
                  >
                    {m.type === "RECETTE" ? "+" : "−"}
                    {formaterMontant(m.montant)}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{formaterMontant(m.soldeCumule)}</td>
                </tr>
              ))}
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-faint">
                    Aucun mouvement pour l&apos;instant.
                  </td>
                </tr>
              )}
            </tbody>
          </TableWrap>
        </div>
      </div>
    </div>
  );
}
