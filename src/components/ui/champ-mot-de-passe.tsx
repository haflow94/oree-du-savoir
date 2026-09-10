"use client";

import { useId, useState } from "react";
import { CONTROL_CLASSES } from "./champ";

// Exclut les caractères ambigus à l'écran/à l'oral (0/O, 1/l/I) — le mot de
// passe généré doit pouvoir être lu et recopié sans erreur par la personne à
// qui on le communique.
const CARACTERES = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_";

export function genererMotDePasse(longueur = 16): string {
  const valeurs = new Uint32Array(longueur);
  crypto.getRandomValues(valeurs);
  return Array.from(valeurs, (v) => CARACTERES[v % CARACTERES.length]).join("");
}

// Champ mot de passe avec bouton de génération aléatoire (>= 12 caractères,
// voir LONGUEUR_MIN_MOT_DE_PASSE) et bouton afficher/masquer, utilisé à la
// création d'un compte comme à la réinitialisation. Value contrôlée pour que
// "Générer" puisse remplir le champ.
export function ChampMotDePasse({
  label,
  name,
  hint,
  required,
  minLength,
  className,
  inputClassName,
  labelClassName,
  autoComplete = "new-password",
  longueurGeneree = 16,
}: {
  label: string;
  name: string;
  hint?: string;
  required?: boolean;
  minLength?: number;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
  autoComplete?: string;
  longueurGeneree?: number;
}) {
  const id = useId();
  const [valeur, setValeur] = useState("");
  const [visible, setVisible] = useState(false);
  const [copie, setCopie] = useState(false);

  function generer() {
    const mdp = genererMotDePasse(longueurGeneree);
    setValeur(mdp);
    setVisible(true);
    navigator.clipboard
      ?.writeText(mdp)
      .then(() => {
        setCopie(true);
        setTimeout(() => setCopie(false), 1500);
      })
      .catch(() => {});
  }

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className={labelClassName ?? "mb-1 block text-sm font-medium text-ink"}
      >
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
          minLength={minLength}
          autoComplete={autoComplete}
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
          className={inputClassName ?? CONTROL_CLASSES}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="shrink-0 whitespace-nowrap text-xs text-ink-muted hover:text-ink"
        >
          {visible ? "Masquer" : "Afficher"}
        </button>
        <button
          type="button"
          onClick={generer}
          className="shrink-0 whitespace-nowrap rounded-md border border-field-border px-2 py-1.5 text-xs font-medium text-ink-muted hover:bg-bg-sunken"
        >
          {copie ? "Copié !" : "Générer"}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}
