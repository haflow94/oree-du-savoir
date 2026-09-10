"use client";

import { Button } from "./button";
import type { Variant } from "./button";

// Déclenche l'impression navigateur (voir la vue `print:block` dédiée sur la
// page appelante, cachée à l'écran) plutôt qu'une génération PDF côté
// serveur : à cette échelle (quelques salles), le dialogue d'impression natif
// suffit et évite d'ajouter Puppeteer pour ce seul usage.
export function PrintButton({
  children,
  variant = "secondary",
}: {
  children: React.ReactNode;
  variant?: Variant;
}) {
  return (
    <Button type="button" variant={variant} onClick={() => window.print()}>
      {children}
    </Button>
  );
}
