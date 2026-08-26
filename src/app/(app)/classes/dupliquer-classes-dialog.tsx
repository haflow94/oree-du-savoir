"use client";

import { useEffect, useRef } from "react";
import { dupliquerClassesAction } from "./actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { CONTROL_CLASSES } from "@/components/ui/champ";

type Annee = { id: string; libelle: string };

// Section "Dupliquer des classes vers l'année active" : repliée dans une
// popup pour la même raison que CoursDialog (voir classes/page.tsx) — elle
// ne s'utilise qu'occasionnellement (bascule d'année scolaire) et n'a pas
// besoin de rester dépliée en permanence au-dessus du tableau des classes.
export function DupliquerClassesDialog({
  annees,
  anneeActive,
  ouvrirAuChargement,
}: {
  annees: Annee[];
  anneeActive: Annee;
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
        Dupliquer vers {anneeActive.libelle}
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto w-full max-w-lg rounded-xl border border-border bg-bg-elevated p-0 shadow-modal backdrop:bg-ink/40"
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">
              Dupliquer des classes vers l&apos;année active
            </h3>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-ink-faint hover:text-ink"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            Copie cours, niveau, créneau, salle et enseignants
            d&apos;une année vers {anneeActive.libelle} en un clic. Les
            classes déjà présentes sur {anneeActive.libelle} (même cours,
            niveau, jour et heure) ne sont pas dupliquées deux fois.
          </p>
          <form action={dupliquerClassesAction} className="mt-4 flex flex-wrap items-end gap-2">
            <select name="anneeSourceId" defaultValue="" className={CONTROL_CLASSES}>
              <option value="" disabled>
                Depuis quelle année ?
              </option>
              {annees
                .filter((a) => a.id !== anneeActive.id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.libelle}
                  </option>
                ))}
            </select>
            <Button type="submit" variant="secondary">
              Dupliquer vers {anneeActive.libelle}
            </Button>
          </form>
        </div>
      </dialog>
    </>
  );
}
