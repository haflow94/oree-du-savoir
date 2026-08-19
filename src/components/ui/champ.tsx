import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const LABEL_CLASSES = "mb-1 block text-sm font-medium text-ink";
const CONTROL_CLASSES =
  "w-full rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";

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
