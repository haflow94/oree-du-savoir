"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

const TAB_ACTIVE_CLASSES = "border-pine text-pine-strong";
const TAB_INACTIVE_CLASSES = "border-transparent text-ink-muted hover:text-ink";
const TAB_CLASSES = "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors";

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
            className={`${TAB_CLASSES} ${actif === t.id ? TAB_ACTIVE_CLASSES : TAB_INACTIVE_CLASSES}`}
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

// Même habillage visuel que <Tabs>, mais chaque "onglet" est un lien qui
// navigue réellement (searchParams) plutôt qu'un état masqué côté client :
// pour les cas où la sélection doit rester une URL partageable et se combiner
// à d'autres filtres (ex. Étudiants Adultes/Jeunes). Généralise le pattern
// jusqu'ici recopié à la main écran par écran (voir audit UX, point 12).
export function TabLinks({
  tabs,
}: {
  tabs: { id: string; label: ReactNode; href: string; active: boolean }[];
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          role="tab"
          aria-selected={t.active}
          className={`${TAB_CLASSES} ${t.active ? TAB_ACTIVE_CLASSES : TAB_INACTIVE_CLASSES}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
