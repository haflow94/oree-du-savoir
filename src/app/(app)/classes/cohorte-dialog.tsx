"use client";

import { useEffect, useRef } from "react";
import { creerCohorteAction, modifierCohorteAction, supprimerCohorteAction } from "./actions";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ModalShell } from "@/components/ui/modal-shell";
import { Badge } from "@/components/ui/badge";
import { CONTROL_CLASSES, CONTROL_SM_CLASSES } from "@/components/ui/champ";
import { JOURS_ORDONNES, JOUR_LABELS } from "@/lib/planning";

const LABEL_SM_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

type Cohorte = {
  id: string;
  niveau: string | null;
  jour: (typeof JOURS_ORDONNES)[number];
  cours: { id: string; nom: string };
  _count: { classes: number };
};
type Cours = { id: string; nom: string };

// Catalogue amont Cours + Niveau + Jour, créé en amont d'une Classe (voir
// prisma/schema.prisma#Cohorte) — calqué sur CoursDialog ci-contre.
export function CohorteDialog({
  cohortes,
  cours,
  peutGerer,
  ouvrirAuChargement,
}: {
  cohortes: Cohorte[];
  cours: Cours[];
  peutGerer: boolean;
  ouvrirAuChargement: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (ouvrirAuChargement) dialogRef.current?.showModal();
  }, [ouvrirAuChargement]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonVariants({ variant: "secondary" })}
      >
        Cohortes ({cohortes.length})
      </button>
      <ModalShell dialogRef={dialogRef} title={<h3 className="text-sm font-semibold text-ink">Cohortes</h3>} maxWidth="max-w-2xl">
          <p className="mt-1 text-xs text-ink-faint">
            Une cohorte (cours + niveau + jour) est créée une fois puis
            réutilisée chaque année scolaire pour créer une classe.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {cohortes.length === 0 && <p className="text-sm text-ink-faint">Aucune cohorte enregistrée.</p>}
            {cohortes.map((c) =>
              peutGerer ? (
                <details key={c.id} className="rounded-lg border border-border px-3 py-1.5">
                  <summary className="cursor-pointer text-sm text-ink-muted">
                    {c.cours.nom}
                    {c.niveau ? ` — ${c.niveau}` : ""}
                    <span className="ml-1 text-xs text-ink-faint">({JOUR_LABELS[c.jour]})</span>
                  </summary>
                  <form action={modifierCohorteAction} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="cohorteId" value={c.id} />
                    <div>
                      <label className={LABEL_SM_CLASSES}>Cours</label>
                      <select name="coursId" required defaultValue={c.cours.id} className={CONTROL_SM_CLASSES}>
                        {cours.map((co) => (
                          <option key={co.id} value={co.id}>
                            {co.nom}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL_SM_CLASSES}>Niveau</label>
                      <input name="niveau" defaultValue={c.niveau ?? ""} className={CONTROL_SM_CLASSES} />
                    </div>
                    <div>
                      <label className={LABEL_SM_CLASSES}>Jour</label>
                      <select name="jour" required defaultValue={c.jour} className={CONTROL_SM_CLASSES}>
                        {JOURS_ORDONNES.map((j) => (
                          <option key={j} value={j}>
                            {JOUR_LABELS[j]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <SubmitButton variant="secondary" size="sm" pendingLabel="Enregistrement…">
                      Enregistrer
                    </SubmitButton>
                  </form>
                  <form action={supprimerCohorteAction} className="mt-2">
                    <input type="hidden" name="cohorteId" value={c.id} />
                    <button
                      type="submit"
                      disabled={c._count.classes > 0}
                      title={
                        c._count.classes > 0
                          ? "Des classes sont rattachées à cette cohorte : impossible de la supprimer."
                          : undefined
                      }
                      className="text-xs font-medium text-rust hover:underline disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline"
                    >
                      Supprimer cette cohorte
                    </button>
                  </form>
                </details>
              ) : (
                <Badge key={c.id} variant="neutral">
                  {c.cours.nom}
                  {c.niveau ? ` — ${c.niveau}` : ""} ({JOUR_LABELS[c.jour]})
                </Badge>
              ),
            )}
          </div>

          {peutGerer && (
            <>
              <form action={creerCohorteAction} className="mt-4 flex flex-wrap gap-2">
                <select name="coursId" required defaultValue="" className={CONTROL_CLASSES}>
                  <option value="" disabled>
                    Cours
                  </option>
                  {cours.map((co) => (
                    <option key={co.id} value={co.id}>
                      {co.nom}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  name="niveau"
                  placeholder="Niveau (optionnel)"
                  className={`w-full max-w-xs ${CONTROL_CLASSES}`}
                />
                <select name="jour" required defaultValue="" className={CONTROL_CLASSES}>
                  <option value="" disabled>
                    Jour
                  </option>
                  {JOURS_ORDONNES.map((j) => (
                    <option key={j} value={j}>
                      {JOUR_LABELS[j]}
                    </option>
                  ))}
                </select>
                <SubmitButton variant="secondary" pendingLabel="Ajout…">
                  Ajouter
                </SubmitButton>
              </form>
              {cours.length === 0 && (
                <p className="mt-2 text-sm text-ochre">
                  Aucun cours enregistré : créez d&apos;abord un cours ci-dessus.
                </p>
              )}
            </>
          )}
      </ModalShell>
    </>
  );
}
