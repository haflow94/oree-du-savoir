import type { ButtonHTMLAttributes } from "react";

export type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type Size = "default" | "sm";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:cursor-not-allowed disabled:opacity-40";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-pine text-on-accent hover:bg-pine-strong",
  secondary:
    "border border-border-strong text-pine bg-transparent hover:bg-pine-soft",
  ghost: "text-ink-muted hover:text-pine",
  danger: "bg-rust text-on-accent hover:bg-rust-strong",
  // Formalise le variant "valider/approuver" jusqu'ici réinventé à la main
  // par écran (ex. annees-scolaires/page.tsx) — même forme que `secondary`
  // (bordure + fond transparent) mais en sauge, pour une action positive qui
  // n'est pas la primaire de la page.
  success: "border border-sage-border text-sage bg-transparent hover:bg-sage-bg",
};

const SIZES: Record<Size, string> = {
  default: "px-4 py-2 text-sm",
  sm: "px-3 py-1.5 text-xs",
};

export function buttonVariants({
  variant = "primary",
  size = "default",
  className = "",
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
} = {}): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim();
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  );
}
