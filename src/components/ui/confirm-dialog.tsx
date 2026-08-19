"use client";

import { useRef } from "react";
import { buttonVariants } from "./button";

// Enveloppe une action destructive existante d'une confirmation, sans toucher
// à la Server Action : le formulaire visé garde son `action` normal, on lui
// donne juste un `id` que ce bouton de confirmation référence via
// `form={formId}` pour le soumettre depuis l'intérieur du <dialog>.
export function ConfirmDialog({
  formId,
  title,
  description,
  confirmLabel = "Confirmer",
  triggerLabel,
  disabled,
  disabledTitle,
}: {
  formId: string;
  title: string;
  description: string;
  confirmLabel?: string;
  triggerLabel: string;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title={disabled ? disabledTitle : undefined}
        onClick={() => dialogRef.current?.showModal()}
        className={buttonVariants({ variant: "danger", size: "sm" })}
      >
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto w-full max-w-sm rounded-xl border border-border bg-bg-elevated p-0 shadow-modal backdrop:bg-ink/40"
      >
        <div className="p-5">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="mt-2 text-sm text-ink-muted">{description}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Annuler
            </button>
            <button
              type="submit"
              form={formId}
              className={buttonVariants({ variant: "danger", size: "sm" })}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
