import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const LABEL_CLASSES = "mb-1 block text-sm font-medium text-ink";
const REQUIRED_MARK = <span className="text-rust" aria-hidden="true"> *</span>;
// Source unique : réutilisée par tout input/select/textarea de l'appli,
// géré par ce fichier ou construit à la main ailleurs (voir auto-submit.tsx
// et les formulaires de filtre qui l'importent directement).
// scroll-mt-20 : quand le navigateur amène un champ invalide dans le
// viewport (validation native au submit, ou reportValidity() manuel — voir
// preinscription-form.tsx), ce décalage évite que le champ se retrouve
// caché sous une éventuelle nav sticky (voir STEP_NAV_LINK_CLASSES).
export const CONTROL_CLASSES =
  "w-full scroll-mt-20 rounded-md border border-field-border bg-field-bg px-3 py-2 text-sm text-ink transition-colors focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";

// Variante sans `w-full`, pour les contrôles alignés en ligne (barres de
// filtres, formulaires inline) : sans elle, un <select> hérite de w-full et
// réclame toute la largeur de son conteneur flex, ce qui force chaque
// contrôle sur sa propre ligne dans une barre de filtres (voir TOOLBAR_CLASSES).
export const CONTROL_SM_CLASSES =
  "rounded-md border border-field-border bg-field-bg px-2 py-1.5 text-sm text-ink transition-colors focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";

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
        {props.required && REQUIRED_MARK}
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
        {props.required && REQUIRED_MARK}
      </label>
      <select id={selectId} name={name} className={CONTROL_CLASSES} {...props}>
        {children}
      </select>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

// Groupe de boutons radio — un seul choix possible parmi `options`, jamais
// une case cochée par défaut (même esprit que le OUI/NON d'autorisation
// image, voir preinscription-form.tsx) : `defaultValue` ne coche rien si
// absent/non trouvé, à la différence d'un <select> qui retomberait sur sa
// première <option>.
export function ChampRadioGroup({
  label,
  hint,
  className,
  name,
  options,
  required,
  defaultValue,
}: {
  label: string;
  hint?: string;
  className?: string;
  name: string;
  options: string[];
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <div className={className}>
      <p className={LABEL_CLASSES}>
        {label}
        {required && REQUIRED_MARK}
      </p>
      <div className="flex flex-wrap gap-4">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm text-ink">
            <input
              type="radio"
              name={name}
              value={option}
              required={required}
              defaultChecked={defaultValue === option}
              className="h-4 w-4 scroll-mt-20 border-border"
            />
            {option}
          </label>
        ))}
      </div>
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
