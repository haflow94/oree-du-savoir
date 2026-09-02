"use client";

import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonVariants } from "./button";
import { formaterMontant } from "@/lib/paiements";

// Garde-fou contre une faute de frappe sur le montant dû à la création d'un
// dossier annuel : le champ reste librement modifiable à la main (fratrie,
// remise…), mais un montant saisi qui s'écarte du tarif suggéré déclenche une
// confirmation explicite avant envoi au lieu de partir silencieusement (cas
// vécu : 180 € saisis au lieu des 550 € suggérés par le tarif de section).
// Bouton rendu DANS le <form> qu'il soumet, comme SubmitButton (voir son
// commentaire sur useFormStatus) — pas de dialog séparé du <form> ici, donc
// pas besoin de l'attribut form=(voir ConfirmDialog) : le bouton "Confirmer
// quand même" est simplement un autre submit imbriqué dans le même <form>.
export function SubmitMontantDu({
  montantInputId,
  montantSuggere,
  pendingLabel,
  children,
}: {
  montantInputId: string;
  montantSuggere: number | null;
  pendingLabel: ReactNode;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [montantSaisi, setMontantSaisi] = useState<number | null>(null);

  function verifier(e: MouseEvent<HTMLButtonElement>) {
    if (montantSuggere === null) return;
    const input = document.getElementById(montantInputId) as HTMLInputElement | null;
    const saisi = input ? Number.parseFloat(input.value) : NaN;
    if (Number.isNaN(saisi) || saisi === montantSuggere) return;
    e.preventDefault();
    setMontantSaisi(saisi);
    dialogRef.current?.showModal();
  }

  return (
    <>
      <button
        type="submit"
        disabled={pending}
        onClick={verifier}
        className={buttonVariants({ variant: "primary" })}
      >
        {pending ? pendingLabel : children}
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto w-full max-w-sm rounded-xl border border-border bg-bg-elevated p-0 shadow-modal backdrop:bg-ink/40"
      >
        <div className="p-5">
          <h3 className="text-sm font-semibold text-ink">Montant différent du tarif suggéré</h3>
          <p className="mt-2 text-sm text-ink-muted">
            Montant saisi : {montantSaisi !== null ? formaterMontant(montantSaisi) : "—"} — tarif
            suggéré : {montantSuggere !== null ? formaterMontant(montantSuggere) : "—"}. Confirmer ce
            montant ?
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Modifier
            </button>
            <button type="submit" className={buttonVariants({ variant: "primary", size: "sm" })}>
              Confirmer quand même
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
