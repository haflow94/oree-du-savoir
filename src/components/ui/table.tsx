import type { ReactNode } from "react";

// Force le défilement horizontal sur petit écran au lieu de couper les
// colonnes de droite (bug relevé sur les 8 tableaux existants, aucun ne le
// faisait).
export function TableWrap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-border bg-bg-elevated shadow-card ${className}`}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-bg-sunken text-xs font-medium uppercase tracking-wide text-ink-faint">
      <tr>{children}</tr>
    </thead>
  );
}
