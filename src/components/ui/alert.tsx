import type { ReactNode } from "react";

type Variant = "success" | "warning" | "danger" | "info";

const VARIANTS: Record<Variant, string> = {
  success: "bg-sage-bg border-sage-border text-pine-strong",
  warning: "bg-ochre-bg border-ochre-border text-ochre",
  danger: "bg-rust-bg border-rust-border text-rust",
  info: "bg-sky-bg border-sky-border text-sky",
};

export function Alert({
  variant = "info",
  children,
}: {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <p
      role="alert"
      className={`rounded-lg border border-l-4 px-3 py-2 text-sm ${VARIANTS[variant]}`}
    >
      {children}
    </p>
  );
}
