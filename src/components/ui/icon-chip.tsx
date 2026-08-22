import type { LucideIcon } from "lucide-react";

/** Grammaire de couleur par domaine, cohérente avec les variantes de Badge. */
export type Accent = "pine" | "sage" | "ochre" | "sky" | "rust";

const ACCENT_CLASSES: Record<Accent, string> = {
  pine: "bg-pine-soft text-pine-strong",
  sage: "bg-sage-bg text-sage",
  ochre: "bg-ochre-bg text-ochre",
  sky: "bg-sky-bg text-sky",
  rust: "bg-rust-bg text-rust",
};

export function IconChip({
  icon: Icon,
  accent,
}: {
  icon: LucideIcon;
  accent: Accent;
}) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ACCENT_CLASSES[accent]}`}
    >
      <Icon aria-hidden size={20} strokeWidth={1.75} />
    </span>
  );
}
