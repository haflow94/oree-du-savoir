import type { ReactNode } from "react";

type Variant = "success" | "warning" | "danger" | "info" | "neutral";

const VARIANTS: Record<Variant, string> = {
  success: "bg-sage-bg text-sage border-sage-border",
  warning: "bg-ochre-bg text-ochre border-ochre-border",
  danger: "bg-rust-bg text-rust border-rust-border",
  info: "bg-sky-bg text-sky border-sky-border",
  neutral: "bg-bg-sunken text-ink-muted border-border",
};

export function Badge({
  variant = "neutral",
  children,
}: {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${VARIANTS[variant]}`}
    >
      {children}
    </span>
  );
}
