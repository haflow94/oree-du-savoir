"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { CONTROL_CLASSES } from "./champ";

const LABEL_CLASSES = "mb-1 block text-sm font-medium text-ink";

// Soumet le formulaire GET parent dès que la valeur change, sans bouton
// "Filtrer" à cliquer. Réservé aux champs dont chaque changement représente
// un choix complet (select, date) — jamais à un champ texte libre, où
// soumettre à chaque frappe harcèlerait le serveur pour rien.
export function AutoSubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}

export function AutoSubmitInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}

// Équivalent auto-soumis de ChampSelect (src/components/ui/champ.tsx) : même
// rendu (label + select), mais doit être un composant client pour porter le
// onChange — d'où la duplication des deux classes plutôt qu'un import croisé.
export function ChampSelectAuto({
  label,
  hint,
  className,
  id,
  name,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const selectId = id ?? name;
  return (
    <div className={className}>
      <label htmlFor={selectId} className={LABEL_CLASSES}>
        {label}
      </label>
      <AutoSubmitSelect id={selectId} name={name} className={CONTROL_CLASSES} {...props}>
        {children}
      </AutoSubmitSelect>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}
