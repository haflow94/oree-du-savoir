import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MOYEN_LABELS,
  STATUT_CHEQUE_LABELS,
  STATUT_COTISATION_VARIANTS,
  formaterMontant,
  statutCotisation,
} from "@/lib/paiements";
import {
  ajouterEcheanceAction,
  basculerRembourseAction,
  enregistrerPaiementAction,
  mettreAJourChequeAction,
  modifierMontantDuAction,
  modifierPaiementAction,
  modifierEcheanceAction,
  supprimerEcheanceAction,
} from "./actions";
import { Role, hasRole } from "@/lib/roles";
import { ChampsMoyenPaiement } from "./champs-moyen-paiement";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

const PEUT_SAISIR = [Role.ACCUEIL, Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU];
const PEUT_GERER_CHEQUE = [Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU];
const CONTROL_XS_CLASSES =
  "rounded-md border border-border-strong bg-bg-elevated px-2 py-1 text-xs text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";
const CONTROL_SM_CLASSES =
  "rounded-md border border-border-strong bg-bg-elevated px-2 py-1.5 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";
const LABEL_XS_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

const ERROR_MESSAGES: Record<string, string> = {
  DOSSIER_EXISTANT: "Un dossier existe déjà pour cet étudiant sur cette année.",
  CHAMPS_MANQUANTS: "Merci de renseigner tous les champs obligatoires.",
  CHAMPS_INVALIDES: "Le moyen de paiement ou le statut sélectionné n'est pas valide.",
  ECHEANCE_INTROUVABLE: "Cette échéance n'existe plus.",
  ECHEANCE_UTILISEE: "Impossible de supprimer : un paiement existe déjà sur cette échéance.",
  DOSSIER_INTROUVABLE: "Ce dossier n'existe plus.",
  PAIEMENT_INTROUVABLE: "Ce paiement n'existe plus.",
  CHEQUE_INTROUVABLE: "Ce chèque n'existe plus.",
};

export default async function DossierPaiementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireSession();
  const peutSaisir = hasRole(session.role, PEUT_SAISIR);
  const peutGererCheque = hasRole(session.role, PEUT_GERER_CHEQUE);
  const { id } = await params;
  const { error, ok } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  const dossier = await prisma.dossierAnnuel.findUnique({
    where: { id },
    include: {
      etudiant: true,
      anneeScolaire: true,
      echeances: {
        orderBy: { dateEcheance: "asc" },
        include: { paiements: { include: { cheque: true, prelevement: true } } },
      },
    },
  });

  if (!dossier) {
    notFound();
  }

  const { du, encaisse, reste, statut } = statutCotisation(dossier);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <BackLink href="/paiements" label="Paiements" />
          <h1 className="mt-2 flex items-center gap-2 font-display text-3xl font-semibold text-pine-strong">
            {dossier.etudiant.prenom} {dossier.etudiant.nom} — {dossier.anneeScolaire.libelle}
            <Badge variant={STATUT_COTISATION_VARIANTS[statut]}>{statut}</Badge>
          </h1>
        </div>
        {peutGererCheque && (
          <form action={basculerRembourseAction}>
            <input type="hidden" name="dossierAnnuelId" value={dossier.id} />
            <Button type="submit" variant="secondary" size="sm">
              {dossier.rembourse ? "Annuler le remboursement" : "Marquer comme remboursé"}
            </Button>
          </form>
        )}
      </div>

      {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}
      {ok && !errorMessage && <Alert variant="success">Modification enregistrée.</Alert>}

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs uppercase text-ink-faint">Dû</div>
          <div className="mt-1 text-lg font-semibold text-ink">{formaterMontant(du)}</div>
          {peutGererCheque && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-ink-muted hover:underline">
                Corriger
              </summary>
              <form action={modifierMontantDuAction} className="mt-2 flex items-center gap-2">
                <input type="hidden" name="dossierAnnuelId" value={dossier.id} />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="montantDu"
                  required
                  defaultValue={du}
                  className={`w-24 ${CONTROL_XS_CLASSES}`}
                />
                <Button type="submit" variant="secondary" size="sm">
                  OK
                </Button>
              </form>
            </details>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-ink-faint">Encaissé</div>
          <div className="mt-1 text-lg font-semibold text-sage">{formaterMontant(encaisse)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-ink-faint">Reste</div>
          <div className="mt-1 text-lg font-semibold text-ink">{formaterMontant(reste)}</div>
        </Card>
      </div>

      <div className="space-y-4">
        {dossier.echeances.map((e) => {
          const montantEcheance = Number.parseFloat(e.montant.toString());
          const encaisseEcheance = e.paiements.reduce(
            (total, p) => total + Number.parseFloat(p.montant.toString()),
            0,
          );
          return (
            <Card key={e.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">
                  {e.libelle || "Échéance"} — {formaterMontant(montantEcheance)}
                </h3>
                <span className="text-xs text-ink-muted">
                  échéance le {new Date(e.dateEcheance).toLocaleDateString("fr-FR")}
                  {" · "}
                  {formaterMontant(encaisseEcheance)} encaissé
                </span>
              </div>

              {peutGererCheque && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-ink-muted hover:underline">
                    Corriger cette échéance
                  </summary>
                  <form
                    action={modifierEcheanceAction}
                    className="mt-2 flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="dossierAnnuelId" value={dossier.id} />
                    <input type="hidden" name="echeanceId" value={e.id} />
                    <div>
                      <label className={LABEL_XS_CLASSES}>Libellé</label>
                      <input
                        type="text"
                        name="libelle"
                        defaultValue={e.libelle ?? ""}
                        className={CONTROL_XS_CLASSES}
                      />
                    </div>
                    <div>
                      <label className={LABEL_XS_CLASSES}>Montant</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        name="montant"
                        required
                        defaultValue={montantEcheance}
                        className={`w-24 ${CONTROL_XS_CLASSES}`}
                      />
                    </div>
                    <div>
                      <label className={LABEL_XS_CLASSES}>Date d&apos;échéance</label>
                      <input
                        type="date"
                        name="dateEcheance"
                        required
                        defaultValue={new Date(e.dateEcheance).toISOString().slice(0, 10)}
                        className={CONTROL_XS_CLASSES}
                      />
                    </div>
                    <Button type="submit" variant="secondary" size="sm">
                      Enregistrer
                    </Button>
                  </form>
                  <form action={supprimerEcheanceAction} className="mt-2">
                    <input type="hidden" name="dossierAnnuelId" value={dossier.id} />
                    <input type="hidden" name="echeanceId" value={e.id} />
                    <button
                      type="submit"
                      disabled={e.paiements.length > 0}
                      title={
                        e.paiements.length > 0
                          ? "Des paiements existent déjà sur cette échéance : impossible de la supprimer."
                          : undefined
                      }
                      className="text-xs font-medium text-rust hover:underline disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline"
                    >
                      Supprimer cette échéance
                    </button>
                  </form>
                </details>
              )}

              {e.paiements.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-border pt-3">
                  {e.paiements.map((p) => (
                    <li key={p.id} className="text-sm text-ink-muted">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{formaterMontant(p.montant.toString())}</span>
                        <span className="text-ink-faint">·</span>
                        <span>{MOYEN_LABELS[p.moyen]}</span>
                        <span className="text-ink-faint">·</span>
                        <span>{new Date(p.datePaiement).toLocaleDateString("fr-FR")}</span>
                        {p.cheque && (
                          <Badge variant="neutral">{STATUT_CHEQUE_LABELS[p.cheque.statut]}</Badge>
                        )}
                        {p.prelevement && (
                          <Badge variant="neutral">
                            {p.prelevement.iban && `IBAN …${p.prelevement.iban.slice(-4)}`}
                            {p.prelevement.iban && p.prelevement.referenceMandat && " · "}
                            {p.prelevement.referenceMandat &&
                              `mandat ${p.prelevement.referenceMandat}`}
                          </Badge>
                        )}
                        {peutGererCheque && (
                          <details>
                            <summary className="cursor-pointer text-xs text-ink-faint hover:underline">
                              Corriger le montant
                            </summary>
                            <form
                              action={modifierPaiementAction}
                              className="mt-1 flex items-center gap-2"
                            >
                              <input type="hidden" name="dossierAnnuelId" value={dossier.id} />
                              <input type="hidden" name="paiementId" value={p.id} />
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                name="montant"
                                required
                                defaultValue={p.montant.toString()}
                                className={`w-24 ${CONTROL_XS_CLASSES}`}
                              />
                              <Button type="submit" variant="secondary" size="sm">
                                OK
                              </Button>
                            </form>
                          </details>
                        )}
                      </div>
                      {p.cheque && peutGererCheque && (
                        <form action={mettreAJourChequeAction} className="mt-2 flex flex-wrap items-center gap-2">
                          <input type="hidden" name="dossierAnnuelId" value={dossier.id} />
                          <input type="hidden" name="chequeId" value={p.cheque.id} />
                          <select
                            name="statut"
                            defaultValue={p.cheque.statut}
                            className={CONTROL_XS_CLASSES}
                          >
                            {Object.entries(STATUT_CHEQUE_LABELS).map(([valeur, label]) => (
                              <option key={valeur} value={valeur}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            name="motifRejet"
                            placeholder="Motif si rejeté"
                            defaultValue={p.cheque.motifRejet ?? ""}
                            className={CONTROL_XS_CLASSES}
                          />
                          <Button type="submit" variant="secondary" size="sm">
                            Mettre à jour
                          </Button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {peutSaisir && (
                <div className="mt-4 border-t border-border pt-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase text-ink-faint">
                    Nouveau paiement
                  </h4>
                  <form action={enregistrerPaiementAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="dossierAnnuelId" value={dossier.id} />
                    <input type="hidden" name="echeanceId" value={e.id} />
                    <div>
                      <label className={LABEL_XS_CLASSES}>Montant</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        name="montant"
                        required
                        className={`w-28 ${CONTROL_SM_CLASSES}`}
                      />
                    </div>
                    <ChampsMoyenPaiement />
                    <Button type="submit" variant="primary" size="sm">
                      Enregistrer le paiement
                    </Button>
                  </form>
                </div>
              )}
            </Card>
          );
        })}

        {dossier.echeances.length === 0 && (
          <EmptyState message="Aucune échéance pour l'instant." />
        )}
      </div>

      {peutSaisir && (
        <Card>
          <CardTitle>Ajouter une échéance</CardTitle>
          <form action={ajouterEcheanceAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="dossierAnnuelId" value={dossier.id} />
            <div>
              <label className={LABEL_XS_CLASSES}>Libellé</label>
              <input
                type="text"
                name="libelle"
                placeholder="ex. 1re échéance"
                className={CONTROL_SM_CLASSES}
              />
            </div>
            <div>
              <label className={LABEL_XS_CLASSES}>Montant</label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="montant"
                required
                className={`w-28 ${CONTROL_SM_CLASSES}`}
              />
            </div>
            <div>
              <label className={LABEL_XS_CLASSES}>Date d&apos;échéance</label>
              <input type="date" name="dateEcheance" required className={CONTROL_SM_CLASSES} />
            </div>
            <Button type="submit" variant="secondary">
              Ajouter
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
