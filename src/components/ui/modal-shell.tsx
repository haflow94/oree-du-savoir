"use client";

import type { ReactNode, RefObject } from "react";
import { X } from "lucide-react";

// Coquille commune des <dialog> de l'appli (bouton déclencheur laissé à
// l'appelant — il varie trop d'un écran à l'autre pour être mutualisé) :
// jusqu'ici copiée à l'identique dans 8 fichiers *-dialog.tsx/*-row.tsx, avec
// un bouton de fermeture "✕" en texte brut à chaque fois (voir audit UX,
// point 8/12). Centralise le cadre, le fond, l'ombre et la fermeture (icône
// lucide, cohérente avec le reste de l'appli).
export function ModalShell({
  dialogRef,
  title,
  maxWidth = "max-w-lg",
  scroll = true,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: ReactNode;
  /** Classe Tailwind de largeur max (ex. "max-w-2xl"), le contenu variant beaucoup d'un dialog à l'autre. */
  maxWidth?: string;
  /** Désactive le défilement interne + la hauteur max — utile pour un contenu toujours court. */
  scroll?: boolean;
  children: ReactNode;
}) {
  return (
    <dialog
      ref={dialogRef}
      className={`m-auto w-full ${maxWidth} rounded-xl border border-border bg-bg-elevated p-0 shadow-modal backdrop:bg-ink/40`}
    >
      <div className={`p-5 ${scroll ? "max-h-[85vh] overflow-y-auto" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">{title}</div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="shrink-0 rounded-md p-1 text-ink-faint transition-colors hover:bg-bg-sunken hover:text-ink"
            aria-label="Fermer"
          >
            <X aria-hidden size={18} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
