import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const LABEL_CLASSES = "mb-1 block text-sm font-medium text-ink";
// Source unique : réutilisée par tout input/select/textarea de l'appli,
// géré par ce fichier ou construit à la main ailleurs (voir auto-submit.tsx
// et les formulaires de filtre qui l'importent directement).
export const CONTROL_CLASSES =
  "w-full rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";

// Variante sans `w-full`, pour les contrôles alignés en ligne (barres de
// filtres, formulaires inline) : sans elle, un <select> hérite de w-full et
// réclame toute la largeur de son conteneur flex, ce qui force chaque
// contrôle sur sa propre ligne dans une barre de filtres (voir TOOLBAR_CLASSES).
export const CONTROL_SM_CLASSES =
  "rounded-md border border-border-strong bg-bg-elevated px-2 py-1.5 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";

// Barre de filtres compacte : les contrôles (avec CONTROL_SM_CLASSES) et
// actions restent sur une seule ligne autant que possible au lieu de
// repousser le tableau sous plusieurs lignes de filtres. Un enfant avec
// `basis-full` (ex. texte d'aide) retombe proprement sur sa propre ligne.
export const TOOLBAR_CLASSES =
  "flex flex-wrap items-end gap-2 rounded-xl border border-border bg-bg-elevated px-3 py-2.5 shadow-card";

export function Champ({
  label,
  hint,
  className,
  id,
  name,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const inputId = id ?? name;
  return (
    <div className={className}>
      <label htmlFor={inputId} className={LABEL_CLASSES}>
        {label}
      </label>
      <input id={inputId} name={name} className={CONTROL_CLASSES} {...props} />
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

export function ChampSelect({
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
      <select id={selectId} name={name} className={CONTROL_CLASSES} {...props}>
        {children}
      </select>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

export function ChampTextarea({
  label,
  hint,
  className,
  id,
  name,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const areaId = id ?? name;
  return (
    <div className={className}>
      <label htmlFor={areaId} className={LABEL_CLASSES}>
        {label}
      </label>
      <textarea id={areaId} name={name} className={CONTROL_CLASSES} {...props} />
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}
