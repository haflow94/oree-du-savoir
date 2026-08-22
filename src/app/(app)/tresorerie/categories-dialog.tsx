"use client";

import { useRef } from "react";
import {
  creerCategorieAction,
  modifierCategorieAction,
  changerActivationCategorieAction,
} from "./actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CONTROL_CLASSES, CONTROL_SM_CLASSES } from "@/components/ui/champ";

type Categorie = { id: string; nom: string; actif: boolean };

// La gestion des catégories vivait dépliée en permanence dans la colonne de
// gauche, avant le tableau des mouvements : reléguée ici dans une popup pour
// ne pas prendre de place sur une page consultée avant tout pour son tableau
// (voir tresorerie/page.tsx).
export function CategoriesDialog({
  categories,
  peutGerer,
}: {
  categories: Categorie[];
  peutGerer: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonVariants({ variant: "secondary" })}
      >
        Catégories ({categories.length})
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto w-full max-w-lg rounded-xl border border-border bg-bg-elevated p-0 shadow-modal backdrop:bg-ink/40"
      >
        <div className="max-h-[85vh] overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Catégories</h3>
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
        </div>
      </dialog>
    </>
  );
}
