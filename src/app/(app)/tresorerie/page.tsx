import Link from "next/link";
import { Wallet } from "lucide-react";
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
import { CategoriesDialog } from "./categories-dialog";
import { NouveauMouvementDialog } from "./nouveau-mouvement-dialog";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import { TableWrap, TableHead } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { AutoSubmitSelect, AutoSubmitInput } from "@/components/ui/auto-submit";
import { CONTROL_SM_CLASSES, TOOLBAR_CLASSES } from "@/components/ui/champ";

const PEUT_GERER = [Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU];
const LABEL_XS_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

const MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Le nom de la catégorie est obligatoire.",
  CHAMPS_INVALIDES: "Merci de renseigner tous les champs du mouvement.",
};

function versDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function TresoreriePage({
  searchParams,
}: {
  searchParams: Promise<{
    dateDebut?: string;
    dateFin?: string;
    type?: string;
    categorieId?: string;
    moyen?: string;
    q?: string;
    error?: string;
    ok?: string;
  }>;
}) {
  const session = await requireSession();
  const peutGerer = hasRole(session.role, PEUT_GERER);
  const { dateDebut, dateFin, type, categorieId, moyen, q, error, ok } = await searchParams;
  const recherche = q?.trim().toLowerCase() ?? "";
  const message = error ? MESSAGES[error] : undefined;

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

  // Le solde cumulé (colonne "Solde") doit toujours refléter l'historique
  // complet, même quand la liste affichée est filtrée : calculé ici sur tous
  // les mouvements dans l'ordre chronologique. Seules les LIGNES à afficher
  // sont filtrées plus bas — jamais le calcul du solde lui-même, sous peine
  // de fausser la trésorerie réelle affichée sur chaque ligne restante.
  const lignes = mouvements.reduce<
    Array<{
      id: string;
      date: Date;
      libelle: string;
      type: (typeof mouvements)[number]["type"];
      moyen: (typeof mouvements)[number]["moyen"];
      categorieId: string | null;
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
      categorieId: m.categorieId,
      categorieNom: m.categorie?.nom ?? null,
      montant,
      soldeCumule: precedent + (m.type === "RECETTE" ? montant : -montant),
    });
    return acc;
  }, []);
  const soldeActuel = lignes.at(-1)?.soldeCumule ?? 0;

  const lignesFiltrees = lignes.filter((l) => {
    if (dateDebut && versDateStr(l.date) < dateDebut) return false;
    if (dateFin && versDateStr(l.date) > dateFin) return false;
    if (type && l.type !== type) return false;
    if (categorieId && l.categorieId !== categorieId) return false;
    if (moyen && l.moyen !== moyen) return false;
    if (
      recherche &&
      !l.libelle.toLowerCase().includes(recherche) &&
      !(l.categorieNom?.toLowerCase().includes(recherche) ?? false)
    ) {
      return false;
    }
    return true;
  });
  // Le plus récent en tête : plus pratique au quotidien que l'ordre
  // chronologique pur, sans jamais recalculer les soldes déjà attachés à
  // chaque ligne ci-dessus.
  const lignesAffichees = [...lignesFiltrees].reverse();

  const totalCredits = lignesFiltrees
    .filter((l) => l.type === "RECETTE")
    .reduce((s, l) => s + l.montant, 0);
  const totalDebits = lignesFiltrees
    .filter((l) => l.type === "DEPENSE")
    .reduce((s, l) => s + l.montant, 0);
  const resultatPeriode = totalCredits - totalDebits;
  const soldeFinPeriode = lignesFiltrees.at(-1)?.soldeCumule ?? soldeActuel;

  const filtresActifs = Boolean(dateDebut || dateFin || type || categorieId || moyen || recherche);

  const queryExport = new URLSearchParams();
  if (dateDebut) queryExport.set("dateDebut", dateDebut);
  if (dateFin) queryExport.set("dateFin", dateFin);
  if (type) queryExport.set("type", type);
  if (categorieId) queryExport.set("categorieId", categorieId);
  if (moyen) queryExport.set("moyen", moyen);
  if (q?.trim()) queryExport.set("q", q.trim());
  const hrefExport = `/tresorerie/export${queryExport.size > 0 ? `?${queryExport}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconChip icon={Wallet} accent="ochre" />
          <div>
            <h1 className="font-display text-3xl font-semibold text-pine-strong">Trésorerie</h1>
            <p className="text-sm text-ink-muted">
              Livre de caisse débit/crédit, solde calculé en cumul. Volontairement
              simple : pas de comptabilité en partie double.
            </p>
          </div>
        </div>
        <Link href={hrefExport} className={buttonVariants({ variant: "secondary" })}>
          Exporter en CSV{filtresActifs ? " (période affichée)" : ""}
        </Link>
      </div>

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <div className="text-xs uppercase text-ink-faint">Solde actuel</div>
          <div className="mt-1 text-2xl font-bold text-ink">{formaterMontant(soldeActuel)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-ink-faint">
            Crédit{filtresActifs ? " (filtré)" : ""}
          </div>
          <div className="mt-1 text-2xl font-bold text-sage">{formaterMontant(totalCredits)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-ink-faint">
            Débit{filtresActifs ? " (filtré)" : ""}
          </div>
          <div className="mt-1 text-2xl font-bold text-rust">{formaterMontant(totalDebits)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-ink-faint">
            Résultat{filtresActifs ? " (filtré)" : ""}
          </div>
          <div
            className={`mt-1 text-2xl font-bold ${resultatPeriode >= 0 ? "text-sage" : "text-rust"}`}
          >
            {resultatPeriode >= 0 ? "+" : ""}
            {formaterMontant(resultatPeriode)}
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CategoriesDialog categories={categories} peutGerer={peutGerer} />
        {peutGerer && <NouveauMouvementDialog categoriesActives={categoriesActives} />}
      </div>

      <form className={TOOLBAR_CLASSES} action="/tresorerie" method="GET">
        <div>
          <label htmlFor="q" className={LABEL_XS_CLASSES}>
            Recherche
          </label>
          <input
            id="q"
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Libellé ou catégorie…"
            className={`w-44 ${CONTROL_SM_CLASSES}`}
          />
        </div>
        <div>
          <label className={LABEL_XS_CLASSES}>Du</label>
          <AutoSubmitInput
            type="date"
            name="dateDebut"
            defaultValue={dateDebut ?? ""}
            className={CONTROL_SM_CLASSES}
          />
        </div>
        <div>
          <label className={LABEL_XS_CLASSES}>Au</label>
          <AutoSubmitInput
            type="date"
            name="dateFin"
            defaultValue={dateFin ?? ""}
            className={CONTROL_SM_CLASSES}
          />
        </div>
        <div>
          <label className={LABEL_XS_CLASSES}>Type</label>
          <AutoSubmitSelect name="type" defaultValue={type ?? ""} className={CONTROL_SM_CLASSES}>
            <option value="">Tous</option>
            {Object.values(TypeMouvement).map((t) => (
              <option key={t} value={t}>
                {TYPE_MOUVEMENT_LABELS[t]}
              </option>
            ))}
          </AutoSubmitSelect>
        </div>
        <div>
          <label className={LABEL_XS_CLASSES}>Catégorie</label>
          <AutoSubmitSelect
            name="categorieId"
            defaultValue={categorieId ?? ""}
            className={CONTROL_SM_CLASSES}
          >
            <option value="">Toutes</option>
            {toutesCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
                {!c.actif ? " (désactivée)" : ""}
              </option>
            ))}
          </AutoSubmitSelect>
        </div>
        <div>
          <label className={LABEL_XS_CLASSES}>Moyen</label>
          <AutoSubmitSelect name="moyen" defaultValue={moyen ?? ""} className={CONTROL_SM_CLASSES}>
            <option value="">Tous</option>
            {Object.values(MoyenPaiement).map((m) => (
              <option key={m} value={m}>
                {MOYEN_LABELS[m]}
              </option>
            ))}
          </AutoSubmitSelect>
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Rechercher
        </button>
        {filtresActifs && (
          <Link href="/tresorerie" className="text-xs font-medium text-ink-muted hover:underline">
            Réinitialiser
          </Link>
        )}
      </form>

      <Tabs
        tabs={[
          {
            id: "mouvements",
            label: "Mouvements",
            content: (
              <TableWrap>
                <TableHead>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Libellé</th>
                  <th className="px-4 py-3">Catégorie</th>
                  <th className="px-4 py-3">Moyen</th>
                  <th className="px-4 py-3 text-right">Débit</th>
                  <th className="px-4 py-3 text-right">Crédit</th>
                  <th className="px-4 py-3 text-right">Solde</th>
                </TableHead>
                <tbody className="divide-y divide-border">
                  {lignesAffichees.map((m) => (
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
                      <td className="px-4 py-3 text-right font-medium text-rust">
                        {m.type === "DEPENSE" ? formaterMontant(m.montant) : ""}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-sage">
                        {m.type === "RECETTE" ? formaterMontant(m.montant) : ""}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-muted">
                        {formaterMontant(m.soldeCumule)}
                      </td>
                    </tr>
                  ))}
                  {lignesAffichees.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-ink-faint">
                        {filtresActifs
                          ? "Aucun mouvement pour ces filtres."
                          : "Aucun mouvement pour l'instant."}
                      </td>
                    </tr>
                  )}
                </tbody>
                {lignesAffichees.length > 0 && (
                  <tfoot className="border-t border-border bg-bg-sunken text-sm font-semibold">
                    <tr>
                      <td className="px-4 py-3 text-ink-muted" colSpan={4}>
                        Totaux{filtresActifs ? " (période affichée)" : ""}
                      </td>
                      <td className="px-4 py-3 text-right text-rust">{formaterMontant(totalDebits)}</td>
                      <td className="px-4 py-3 text-right text-sage">{formaterMontant(totalCredits)}</td>
                      <td className="px-4 py-3 text-right text-ink">{formaterMontant(soldeFinPeriode)}</td>
                    </tr>
                  </tfoot>
                )}
              </TableWrap>
            ),
          },
          {
            id: "credit-debit",
            label: "Crédit / Débit",
            content: (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-sage">
                    Crédit{filtresActifs ? " (filtré)" : ""}
                  </h3>
                  <TableWrap>
                    <TableHead>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Libellé</th>
                      <th className="px-4 py-3">Catégorie</th>
                      <th className="px-4 py-3 text-right">Montant</th>
                    </TableHead>
                    <tbody className="divide-y divide-border">
                      {lignesAffichees
                        .filter((m) => m.type === "RECETTE")
                        .map((m) => (
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
                            <td className="px-4 py-3 text-right font-medium text-sage">
                              {formaterMontant(m.montant)}
                            </td>
                          </tr>
                        ))}
                      {lignesAffichees.every((m) => m.type !== "RECETTE") && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-ink-faint">
                            Aucun crédit{filtresActifs ? " pour ces filtres." : "."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="border-t border-border bg-bg-sunken text-sm font-semibold">
                      <tr>
                        <td className="px-4 py-3 text-ink-muted" colSpan={3}>
                          Total
                        </td>
                        <td className="px-4 py-3 text-right text-sage">
                          {formaterMontant(totalCredits)}
                        </td>
                      </tr>
                    </tfoot>
                  </TableWrap>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-rust">
                    Débit{filtresActifs ? " (filtré)" : ""}
                  </h3>
                  <TableWrap>
                    <TableHead>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Libellé</th>
                      <th className="px-4 py-3">Catégorie</th>
                      <th className="px-4 py-3 text-right">Montant</th>
                    </TableHead>
                    <tbody className="divide-y divide-border">
                      {lignesAffichees
                        .filter((m) => m.type === "DEPENSE")
                        .map((m) => (
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
                            <td className="px-4 py-3 text-right font-medium text-rust">
                              {formaterMontant(m.montant)}
                            </td>
                          </tr>
                        ))}
                      {lignesAffichees.every((m) => m.type !== "DEPENSE") && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-ink-faint">
                            Aucun débit{filtresActifs ? " pour ces filtres." : "."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="border-t border-border bg-bg-sunken text-sm font-semibold">
                      <tr>
                        <td className="px-4 py-3 text-ink-muted" colSpan={3}>
                          Total
                        </td>
                        <td className="px-4 py-3 text-right text-rust">
                          {formaterMontant(totalDebits)}
                        </td>
                      </tr>
                    </tfoot>
                  </TableWrap>
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
