import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  INCIDENT_LABELS,
  MOYEN_LABELS,
  STATUT_CHEQUE_LABELS,
  STATUT_COTISATION_VARIANTS,
  formaterMontant,
  incidentDePaiement,
  statutCotisation,
  totalEncaisse,
} from "@/lib/paiements";
import {
  ajouterEcheanceAction,
  basculerRembourseAction,
  enregistrerPaiementAction,
  mettreAJourChequeAction,
  mettreAJourPrelevementAction,
  modifierMontantDuAction,
  modifierPaiementAction,
  modifierEcheanceAction,
  supprimerEcheanceAction,
} from "./actions";
import { requireModule, peutAccederModule, Module } from "@/lib/permissions";
import { ChampsMoyenPaiement } from "./champs-moyen-paiement";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

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
  PRELEVEMENT_INTROUVABLE: "Ce prélèvement n'existe plus.",
};

export default async function DossierPaiementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireModule(Module.PAIEMENTS, "LECTURE");
  // Un seul niveau d'écriture sur ce module (voir la grille de permissions) :
  // saisir un paiement ou corriger une échéance/un chèque/le montant dû sont
  // la même capacité, plus de distinction fine par rôle comme auparavant.
  const peutSaisir = await peutAccederModule(session.role, Module.PAIEMENTS, "ECRITURE");
  const peutGererCheque = peutSaisir;
  // Un dossier appartient toujours à un seul étudiant : revenir à sa fiche
  // est plus utile que la liste générique "Paiements" — mais seulement si le
  // rôle courant a accès au module Étudiants (pas garanti, ex. Trésorier),
  // sans quoi le lien retomberait sur /acces-refuse.
  const peutVoirEtudiant = await peutAccederModule(session.role, Module.ETUDIANTS, "LECTURE");
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
        include: {
          paiements: { include: { cheque: { include: { documents: true } }, prelevement: true } },
        },
      },
    },
  });

  if (!dossier) {
    notFound();
  }

  const { du, encaisse, reste, statut } = statutCotisation(dossier);

  // Incidents (chèque impayé, prélèvement rejeté) toutes échéances
  // confondues sur ce dossier — voir lib/paiements.ts#incidentDePaiement.
  const incidents = dossier.echeances.flatMap((e) =>
    e.paiements.flatMap((p) => {
      const incident = incidentDePaiement(p);
      return incident ? [{ echeance: e, paiement: p, incident }] : [];
    }),
  );

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <BackLink
            href={peutVoirEtudiant ? `/etudiants/${dossier.etudiantId}` : "/paiements"}
            label={peutVoirEtudiant ? `${dossier.etudiant.prenom} ${dossier.etudiant.nom}` : "Paiements"}
          />
          <h1 className="mt-2 flex items-center gap-2 font-display text-3xl font-semibold text-pine-strong">
            {dossier.etudiant.prenom} {dossier.etudiant.nom} — {dossier.anneeScolaire.libelle}
            <Badge variant={STATUT_COTISATION_VARIANTS[statut]}>{statut}</Badge>
          </h1>
        </div>
        {peutGererCheque && (
          <form action={basculerRembourseAction}>
            <input type="hidden" name="dossierAnnuelId" value={dossier.id} />
            <SubmitButton variant="secondary" size="sm">
              {dossier.rembourse ? "Annuler le remboursement" : "Marquer comme remboursé"}
            </SubmitButton>
          </form>
        )}
      </div>

      {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}
      {ok && !errorMessage && <Alert variant="success">Modification enregistrée.</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <aside className="space-y-4 lg:order-last">
          <Card>
            <CardTitle>Incidents</CardTitle>
            {incidents.length === 0 ? (
              <p className="mt-3 text-sm text-ink-faint">Aucun incident sur ce dossier.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {incidents.map(({ echeance, paiement, incident }) => (
                  <li key={paiement.id} className="rounded-lg border border-rust-border bg-rust-bg p-2.5">
                    <Badge variant="danger">{INCIDENT_LABELS[incident.type]}</Badge>
                    <p className="mt-1.5 text-xs text-ink">
                      <a href={`#echeance-${echeance.id}`} className="hover:underline">
                        {echeance.libelle || "Échéance"} · {formaterMontant(paiement.montant.toString())}
                      </a>
                    </p>
                    {incident.motif && (
                      <p className="mt-0.5 text-xs text-ink-muted">{incident.motif}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>

        <div className="space-y-6">
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
                <SubmitButton variant="secondary" size="sm">
                  OK
                </SubmitButton>
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
          const encaisseEcheance = totalEncaisse(e.paiements);
          // Comparaison au centime près (évite les faux positifs
          // d'arrondi flottant type 0.1 + 0.2) : une échéance déjà couverte
          // par ses paiements ne doit plus proposer d'en enregistrer un
          // nouveau — voir le formulaire "Nouveau paiement" plus bas.
          const echeanceSoldee = Math.round(encaisseEcheance * 100) >= Math.round(montantEcheance * 100);
          // Affiché sur l'échéance elle-même plutôt que sur chaque ligne de
          // paiement (voir la carte "Incidents" ci-contre) : un chèque
          // impayé ou un prélèvement rejeté concerne l'échéance dans son
          // ensemble, pas seulement le paiement qui l'a soldée.
          const echeanceEnIncident = e.paiements.some((p) => incidentDePaiement(p));
          return (
            <Card key={e.id} id={`echeance-${e.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {e.libelle || "Échéance"} — {formaterMontant(montantEcheance)}
                  {echeanceEnIncident && <Badge variant="danger">Incident</Badge>}
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
                    <SubmitButton variant="secondary" size="sm">
                      Enregistrer
                    </SubmitButton>
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
                  {e.paiements.map((p) => {
                    const incident = incidentDePaiement(p);
                    return (
                    <li key={p.id} className="text-sm text-ink-muted">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{formaterMontant(p.montant.toString())}</span>
                        <span className="text-ink-faint">·</span>
                        <span>{MOYEN_LABELS[p.moyen]}</span>
                        <span className="text-ink-faint">·</span>
                        <span>{new Date(p.datePaiement).toLocaleDateString("fr-FR")}</span>
                        {p.cheque && (
                          <Badge variant={p.cheque.statut === "REJETE" ? "danger" : "neutral"}>
                            {STATUT_CHEQUE_LABELS[p.cheque.statut]}
                          </Badge>
                        )}
                        {p.cheque && p.cheque.nombreAlertesEnvoyees > 0 && (
                          <Badge variant="warning">
                            Alerte envoyée le{" "}
                            {new Date(p.cheque.derniereAlerteEnvoyeeLe!).toLocaleDateString("fr-FR")} (
                            {p.cheque.nombreAlertesEnvoyees})
                          </Badge>
                        )}
                        {p.prelevement && (
                          <Badge variant="neutral">
                            {p.prelevement.iban && `IBAN …${p.prelevement.iban.slice(-4)}`}
                            {p.prelevement.iban && p.prelevement.referenceMandat && " · "}
                            {p.prelevement.referenceMandat &&
                              `mandat ${p.prelevement.referenceMandat}`}
                          </Badge>
                        )}
                        {incident && <Badge variant="danger">{INCIDENT_LABELS[incident.type]}</Badge>}
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
                              <SubmitButton variant="secondary" size="sm">
                                OK
                              </SubmitButton>
                            </form>
                          </details>
                        )}
                      </div>
                      {p.cheque && (
                        <p className="mt-1 text-xs text-ink-faint">
                          {p.cheque.numero && `N° ${p.cheque.numero}`}
                          {p.cheque.numero && p.cheque.banque && " · "}
                          {p.cheque.banque}
                          {(p.cheque.numero || p.cheque.banque) &&
                            (p.cheque.titulaireNom || p.cheque.titulairePrenom) &&
                            " · "}
                          {(p.cheque.titulaireNom || p.cheque.titulairePrenom) &&
                            `Titulaire : ${p.cheque.titulairePrenom ?? ""} ${p.cheque.titulaireNom ?? ""}`.trim()}
                          {!p.cheque.titulaireEstEtudiant && p.cheque.documents.length > 0 && (
                            <>
                              {" · "}
                              <a
                                href={`/etudiants/${dossier.etudiantId}/documents/${p.cheque.documents[0].id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-pine hover:underline"
                              >
                                Voir la pièce d&apos;identité du titulaire
                              </a>
                            </>
                          )}
                        </p>
                      )}
                      {p.cheque && peutGererCheque && (
                        <div className="mt-2 rounded-md border border-border bg-bg-sunken/60 p-2">
                          <h4 className="mb-1.5 text-xs font-semibold uppercase text-ink-faint">
                            Statut du chèque — signaler ici un chèque impayé
                          </h4>
                          <form
                            action={mettreAJourChequeAction}
                            className="flex flex-wrap items-center gap-2"
                          >
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
                            <SubmitButton variant="secondary" size="sm">
                              Mettre à jour
                            </SubmitButton>
                          </form>
                        </div>
                      )}
                      {p.prelevement && peutGererCheque && (
                        <div className="mt-2 rounded-md border border-border bg-bg-sunken/60 p-2">
                          <h4 className="mb-1.5 text-xs font-semibold uppercase text-ink-faint">
                            Statut du prélèvement — signaler ici un rejet
                          </h4>
                          <form
                            action={mettreAJourPrelevementAction}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <input type="hidden" name="dossierAnnuelId" value={dossier.id} />
                            <input type="hidden" name="prelevementId" value={p.prelevement.id} />
                            <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                              <input
                                type="checkbox"
                                name="rejete"
                                defaultChecked={p.prelevement.rejete}
                              />
                              Rejeté
                            </label>
                            <input
                              type="text"
                              name="motifRejet"
                              placeholder="Motif si rejeté"
                              defaultValue={p.prelevement.motifRejet ?? ""}
                              className={CONTROL_XS_CLASSES}
                            />
                            <SubmitButton variant="secondary" size="sm">
                              Mettre à jour
                            </SubmitButton>
                          </form>
                        </div>
                      )}
                    </li>
                    );
                  })}
                </ul>
              )}

              {peutSaisir && (
                <div className="mt-4 border-t border-border pt-4">
                  {echeanceSoldee ? (
                    <p className="text-xs text-ink-faint">
                      Échéance soldée — aucun nouveau paiement à enregistrer.
                    </p>
                  ) : (
                    <>
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
                        <ChampsMoyenPaiement
                          etudiantNom={dossier.etudiant.nom}
                          etudiantPrenom={dossier.etudiant.prenom}
                        />
                        <SubmitButton variant="primary" size="sm">
                          Enregistrer le paiement
                        </SubmitButton>
                      </form>
                    </>
                  )}
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
            <SubmitButton variant="secondary">
              Ajouter
            </SubmitButton>
          </form>
        </Card>
      )}
        </div>
      </div>
    </div>
  );
}
