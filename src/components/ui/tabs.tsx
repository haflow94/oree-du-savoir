"use client";

import { useState, type ReactNode } from "react";

// Onglets client-side simples (état local, pas synchronisé à l'URL) :
// suffisant tant qu'aucune page n'a besoin de partager un lien direct vers un
// onglet précis. Tous les panneaux restent montés (juste masqués via
// `hidden`) pour ne jamais perdre l'état d'un formulaire en changeant d'onglet.
export function Tabs({
  tabs,
  defaultTabId,
}: {
  tabs: { id: string; label: string; content: ReactNode }[];
  defaultTabId?: string;
}) {
  const [actif, setActif] = useState(defaultTabId ?? tabs[0]?.id);

  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={actif === t.id}
            onClick={() => setActif(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              actif === t.id
                ? "border-pine text-pine-strong"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tabs.map((t) => (
          <div key={t.id} hidden={actif !== t.id}>
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}
