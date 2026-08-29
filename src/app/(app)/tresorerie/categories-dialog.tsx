"use client";

import { useRef } from "react";
import {
  creerCategorieAction,
  modifierCategorieAction,
  changerActivationCategorieAction,
} from "./actions";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ModalShell } from "@/components/ui/modal-shell";
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
      <ModalShell dialogRef={dialogRef} title={<h3 className="text-sm font-semibold text-ink">Catégories</h3>}>
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
                    <SubmitButton variant="secondary" size="sm" pendingLabel="Renommage…">
                      Renommer
                    </SubmitButton>
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
              <SubmitButton variant="secondary" pendingLabel="Ajout…">
                Ajouter
              </SubmitButton>
            </form>
          )}
      </ModalShell>
    </>
  );
}
