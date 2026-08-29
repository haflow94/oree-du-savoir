"use client";

import { useRef } from "react";
import { creerMouvementAction } from "./actions";
import {
  MoyenPaiement,
  MOYEN_LABELS,
  TypeMouvement,
  TYPE_MOUVEMENT_LABELS,
} from "@/lib/paiements";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ModalShell } from "@/components/ui/modal-shell";
import { CONTROL_CLASSES } from "@/components/ui/champ";

const LABEL_XS_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

type Categorie = { id: string; nom: string };

// Même logique que CategoriesDialog : ce formulaire vivait déplié en
// permanence dans la colonne de gauche (voir tresorerie/page.tsx).
export function NouveauMouvementDialog({ categoriesActives }: { categoriesActives: Categorie[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonVariants({ variant: "primary" })}
      >
        + Nouveau mouvement
      </button>
      <ModalShell dialogRef={dialogRef} title={<h3 className="text-sm font-semibold text-ink">Nouveau mouvement</h3>} maxWidth="max-w-md">
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
                    {TYPE_MOUVEMENT_LABELS[t]} ({t === "RECETTE" ? "crédit" : "débit"})
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
              <input type="number" step="0.01" min="0" name="montant" required className={CONTROL_CLASSES} />
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
            <SubmitButton variant="primary" pendingLabel="Enregistrement…">
              Enregistrer
            </SubmitButton>
          </form>
      </ModalShell>
    </>
  );
}
