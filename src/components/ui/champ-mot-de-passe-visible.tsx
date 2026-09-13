"use client";

import { useId, useState } from "react";
import { CONTROL_CLASSES } from "./champ";

// Champ mot de passe non contrôlé avec bouton afficher/masquer, pour les
// formulaires (ex. connexion) qui n'ont pas besoin de génération aléatoire
// (voir ChampMotDePasse pour la variante avec génération).
export function ChampMotDePasseVisible({
  label,
  name,
  required,
  autoComplete,
  className,
}: {
  label: string;
  name: string;
  required?: boolean;
  autoComplete?: string;
  className?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="text-rust" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required={required}
          autoComplete={autoComplete}
          className={CONTROL_CLASSES}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="shrink-0 whitespace-nowrap text-xs text-ink-muted hover:text-ink"
        >
          {visible ? "Masquer" : "Afficher"}
        </button>
      </div>
    </div>
  );
}
