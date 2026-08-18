import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MoyenPaiement,
  MOYEN_LABELS,
  STATUT_CHEQUE_LABELS,
  formaterMontant,
} from "@/lib/paiements";
import {
  ajouterEcheanceAction,
  enregistrerPaiementAction,
  mettreAJourChequeAction,
  modifierMontantDuAction,
  modifierPaiementAction,
} from "./actions";
import { Role, hasRole } from "@/lib/roles";

const PEUT_SAISIR = [Role.ACCUEIL, Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU];
const PEUT_GERER_CHEQUE = [Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU];

const ERROR_MESSAGES: Record<string, string> = {
  DOSSIER_EXISTANT: "Un dossier existe déjà pour cet étudiant sur cette année.",
};

export default async function DossierPaiementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const peutSaisir = hasRole(session.role, PEUT_SAISIR);
  const peutGererCheque = hasRole(session.role, PEUT_GERER_CHEQUE);
  const { id } = await params;
  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  const dossier = await prisma.dossierAnnuel.findUnique({
    where: { id },
    include: {
      etudiant: true,
      anneeScolaire: true,
      echeances: {
        orderBy: { dateEcheance: "asc" },
        include: { paiements: { include: { cheque: true } } },
      },
    },
  });

  if (!dossier) {
    notFound();
  }

  const du = Number.parseFloat(dossier.montantDu.toString());
  const encaisse = dossier.echeances
    .flatMap((e) => e.paiements)
    .reduce((total, p) => total + Number.parseFloat(p.montant.toString()), 0);
  const reste = du - encaisse;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/paiements" className="text-sm text-slate-500 hover:underline">
          ← Paiements
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">
          {dossier.etudiant.prenom} {dossier.etudiant.nom} — {dossier.anneeScolaire.libelle}
        </h2>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-slate-400">Dû</div>
          <div className="mt-1 text-lg font-semibold text-slate-800">
            {formaterMontant(du)}
          </div>
          {peutGererCheque && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-500 hover:underline">
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
                  className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  OK
                </button>
              </form>
            </details>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-slate-400">Encaissé</div>
          <div className="mt-1 text-lg font-semibold text-emerald-700">
            {formaterMontant(encaisse)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-slate-400">Reste</div>
          <div className="mt-1 text-lg font-semibold text-slate-800">
            {formaterMontant(reste)}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {dossier.echeances.map((e) => {
          const montantEcheance = Number.parseFloat(e.montant.toString());
          const encaisseEcheance = e.paiements.reduce(
            (total, p) => total + Number.parseFloat(p.montant.toString()),
            0,
          );
          return (
            <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">
                  {e.libelle || "Échéance"} — {formaterMontant(montantEcheance)}
                </h3>
                <span className="text-xs text-slate-500">
                  échéance le {new Date(e.dateEcheance).toLocaleDateString("fr-FR")}
                  {" · "}
                  {formaterMontant(encaisseEcheance)} encaissé
                </span>
              </div>

              {e.paiements.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  {e.paiements.map((p) => (
                    <li key={p.id} className="text-sm text-slate-600">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{formaterMontant(p.montant.toString())}</span>
                        <span className="text-slate-400">·</span>
                        <span>{MOYEN_LABELS[p.moyen]}</span>
                        <span className="text-slate-400">·</span>
                        <span>{new Date(p.datePaiement).toLocaleDateString("fr-FR")}</span>
                        {p.cheque && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {STATUT_CHEQUE_LABELS[p.cheque.statut]}
                          </span>
                        )}
                        {peutGererCheque && (
                          <details>
                            <summary className="cursor-pointer text-xs text-slate-400 hover:underline">
                              Corriger le montant
                            </summary>
                            <form
                              action={modifierPaiementAction}
                              className="mt-1 flex items-center gap-2"
                            >
                              <input type="hidden" name="paiementId" value={p.id} />
                              <input type="hidden" name="dossierAnnuelId" value={dossier.id} />
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                name="montant"
                                required
                                defaultValue={p.montant.toString()}
                                className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                              />
                              <button
                                type="submit"
                                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                OK
                              </button>
                            </form>
                          </details>
                        )}
                      </div>
                      {p.cheque && peutGererCheque && (
                        <form action={mettreAJourChequeAction} className="mt-2 flex flex-wrap items-center gap-2">
                          <input type="hidden" name="chequeId" value={p.cheque.id} />
                          <input type="hidden" name="dossierAnnuelId" value={dossier.id} />
                          <select
                            name="statut"
                            defaultValue={p.cheque.statut}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
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
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                          />
                          <button
                            type="submit"
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Mettre à jour
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {peutSaisir && (
              <form action={enregistrerPaiementAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
                <input type="hidden" name="echeanceId" value={e.id} />
                <input type="hidden" name="dossierAnnuelId" value={dossier.id} />
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Montant</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="montant"
                    required
                    className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Moyen</label>
                  <select
                    name="moyen"
                    required
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  >
                    {Object.values(MoyenPaiement).map((m) => (
                      <option key={m} value={m}>
                        {MOYEN_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Banque (chèque)</label>
                  <input
                    type="text"
                    name="chequeBanque"
                    className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">N° chèque</label>
                  <input
                    type="text"
                    name="chequeNumero"
                    className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Titulaire</label>
                  <input
                    type="text"
                    name="chequeTitulaire"
                    className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Enregistrer le paiement
                </button>
              </form>
              )}
            </div>
          );
        })}

        {dossier.echeances.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
            Aucune échéance pour l&apos;instant.
          </p>
        )}
      </div>

      {peutSaisir && (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          Ajouter une échéance
        </h3>
        <form action={ajouterEcheanceAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="dossierAnnuelId" value={dossier.id} />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Libellé</label>
            <input
              type="text"
              name="libelle"
              placeholder="ex. 1re échéance"
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Montant</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="montant"
              required
              className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Date d&apos;échéance</label>
            <input
              type="date"
              name="dateEcheance"
              required
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Ajouter
          </button>
        </form>
      </div>
      )}
    </div>
  );
}
