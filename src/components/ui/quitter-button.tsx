"use client";

import { useState, useTransition } from "react";
import { logoutSansRedirectAction } from "@/app/(app)/logout-action";

// Déconnecte puis tente de fermer l'onglet — le seul moyen de « sortir » de
// la feuille de présence isolée (/appel/[seanceId]) ouverte via un QR. Un
// navigateur ne ferme un onglet en script que s'il l'a lui-même ouvert
// (ou qu'il n'a pas d'historique de navigation) : dans les autres cas,
// window.close() est un no-op silencieux — on affiche alors un message sur
// place plutôt que de renvoyer vers /login (pas envie de réinviter à se
// reconnecter juste après avoir quitté).
export function QuitterButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition();
  const [deconnecte, setDeconnecte] = useState(false);

  if (deconnecte) {
    return (
      <p className="text-sm text-ink-muted">Déconnecté(e). Vous pouvez fermer cet onglet.</p>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() => {
        startTransition(async () => {
          await logoutSansRedirectAction();
          window.close();
          setDeconnecte(true);
        });
      }}
    >
      {pending ? "…" : "Quitter"}
    </button>
  );
}
