"use client";

import { useRef, useState, type MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import { buttonVariants } from "@/components/ui/button";
import { MoyenPaiement, MOYEN_LABELS, formaterMontant } from "@/lib/paiements";

// Dernier garde-fou avant l'écriture définitive d'un paiement (génère un
// mouvement de trésorerie, voir enregistrerPaiementAction) : une faute de
// frappe sur le montant ou la date serait sinon irréversible sans repasser
// par une correction manuelle a posteriori. Bouton rendu DANS le <form>
// qu'il soumet, comme SubmitMontantDu — pas besoin de l'attribut form= sur
// le bouton de confirmation, la <dialog> reste un descendant DOM du <form>
// malgré son rendu en "top layer".
export function ConfirmerPaiementButton() {
  const { pending } = useFormStatus();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [recap, setRecap] = useState<{ montant: string; moyen: string; date: string } | null>(null);

  function ouvrir(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const form = buttonRef.current?.form;
    // reportValidity() déclenche les bulles de validation natives (champs
    // requis, min="0"...) et retourne false sans rien afficher d'autre à
    // faire ici : on n'ouvre la confirmation que sur un formulaire valide.
    if (!form || !form.reportValidity()) return;
    const donnees = new FormData(form);
    const montantBrut = Number.parseFloat(String(donnees.get("montant") ?? ""));
    const moyen = String(donnees.get("moyen") ?? "") as MoyenPaiement;
    const dateBrute = String(donnees.get("datePaiement") ?? "");
    setRecap({
      montant: Number.isFinite(montantBrut) ? formaterMontant(montantBrut) : "—",
      moyen: MOYEN_LABELS[moyen] ?? moyen,
      date: dateBrute ? new Date(dateBrute).toLocaleDateString("fr-FR") : "—",
    });
    dialogRef.current?.showModal();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={pending}
        onClick={ouvrir}
        className={buttonVariants({ variant: "primary", size: "sm" })}
      >
        {pending ? "Enregistrement…" : "Enregistrer le paiement"}
      </button>
      <dialog
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-full max-w-sm rounded-xl border border-border bg-bg-elevated p-0 shadow-modal backdrop:bg-ink/40"
      >
        <div className="p-5">
          <h3 className="text-sm font-semibold text-ink">Confirmer ce paiement ?</h3>
          {recap && (
            <p className="mt-2 text-sm text-ink-muted">
              {recap.montant} · {recap.moyen} · payé le {recap.date}. Un mouvement de trésorerie
              sera créé automatiquement.
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Annuler
            </button>
            <button type="submit" className={buttonVariants({ variant: "primary", size: "sm" })}>
              Confirmer et enregistrer
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
