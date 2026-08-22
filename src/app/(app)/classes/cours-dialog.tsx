"use client";

import { useEffect, useRef } from "react";
import { creerCoursAction, modifierCoursAction, supprimerCoursAction } from "./actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CONTROL_CLASSES, CONTROL_SM_CLASSES } from "@/components/ui/champ";

const LABEL_SM_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

type Cours = { id: string; nom: string; section: { id: string; nom: string }; _count: { classes: number } };
type Section = { id: string; nom: string };

// La liste des cours (avec édition/suppression pour les gestionnaires)
// vivait en permanence dépliée en haut de la page Classes, avant le tableau
// des classes : reléguée ici dans une popup pour laisser le tableau visible
// sans défiler (voir classes/page.tsx).
export function CoursDialog({
  cours,
  sections,
  peutGerer,
  ouvrirAuChargement,
}: {
  cours: Cours[];
  sections: Section[];
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
        Cours ({cours.length})
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto w-full max-w-2xl rounded-xl border border-border bg-bg-elevated p-0 shadow-modal backdrop:bg-ink/40"
      >
        <div className="max-h-[85vh] overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Cours</h3>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-ink-faint hover:text-ink"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {cours.length === 0 && <p className="text-sm text-ink-faint">Aucun cours enregistré.</p>}
            {cours.map((c) =>
              peutGerer ? (
                <details key={c.id} className="rounded-lg border border-border px-3 py-1.5">
                  <summary className="cursor-pointer text-sm text-ink-muted">
                    {c.nom}
                    <span className="ml-1 text-xs text-ink-faint">({c.section.nom})</span>
                  </summary>
                  <form action={modifierCoursAction} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="coursId" value={c.id} />
                    <div>
                      <label className={LABEL_SM_CLASSES}>Nom</label>
                      <input name="nom" required defaultValue={c.nom} className={CONTROL_SM_CLASSES} />
                    </div>
                    <div>
                      <label className={LABEL_SM_CLASSES}>Section</label>
                      <select
                        name="sectionId"
                        required
                        defaultValue={c.section.id}
                        className={CONTROL_SM_CLASSES}
                      >
                        {sections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nom}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button type="submit" variant="secondary" size="sm">
                      Enregistrer
                    </Button>
                  </form>
                  <form action={supprimerCoursAction} className="mt-2">
                    <input type="hidden" name="coursId" value={c.id} />
                    <button
                      type="submit"
                      disabled={c._count.classes > 0}
                      title={
                        c._count.classes > 0
                          ? "Des classes sont rattachées à ce cours : impossible de le supprimer."
                          : undefined
                      }
                      className="text-xs font-medium text-rust hover:underline disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline"
                    >
                      Supprimer ce cours
                    </button>
                  </form>
                </details>
              ) : (
                <Badge key={c.id} variant="neutral">
                  {c.nom} ({c.section.nom})
                </Badge>
              ),
            )}
          </div>

          {peutGerer && (
            <>
              <form action={creerCoursAction} className="mt-4 flex flex-wrap gap-2">
                <input
                  type="text"
                  name="nom"
                  required
                  placeholder="Nom du nouveau cours"
                  className={`w-full max-w-xs ${CONTROL_CLASSES}`}
                />
                <select name="sectionId" required defaultValue="" className={CONTROL_CLASSES}>
                  <option value="" disabled>
                    Section
                  </option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="secondary">
                  Ajouter
                </Button>
              </form>
              {sections.length === 0 && (
                <p className="mt-2 text-sm text-ochre">
                  Aucune section enregistrée : exécutez le seed (
                  <code>npm run db:seed</code>) avant de créer un cours.
                </p>
              )}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
