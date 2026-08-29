"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonVariants, type Variant, type Size } from "./button";

// À utiliser à la place d'un <button type="submit"> nu à l'intérieur d'un
// <form action={...}> : se désactive et affiche `pendingLabel` pendant que la
// Server Action est en vol, pour éviter les doubles soumissions (double
// paiement, double création...). Ne fonctionne que pour un bouton RENDU DANS
// le <form> qu'il soumet — `useFormStatus` ne voit pas le pending state d'un
// bouton hors du <form> référencé via l'attribut form=(voir ConfirmDialog,
// qui garde son propre état de soumission).
export function SubmitButton({
  children,
  pendingLabel,
  variant,
  size,
  className,
  disabled,
}: {
  children: ReactNode;
  pendingLabel?: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={buttonVariants({ variant, size, className })}
    >
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
