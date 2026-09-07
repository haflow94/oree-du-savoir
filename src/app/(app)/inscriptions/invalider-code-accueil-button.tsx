"use client";

import { useState, useTransition } from "react";
import { invaliderCodeAccueilAction } from "./actions";
import { Button } from "@/components/ui/button";

// Bouton "de secours" pour la carte QR d'accueil (page.tsx) : le code
// accueil du jour se régénère déjà tout seul (paresseusement, au prochain
// scan une fois expiré en fin de journée, voir preinscription-code.ts) — ce
// bouton sert uniquement à forcer une invalidation anticipée, ex. en cas de
// doute sur une fuite du code (QR partagé hors des locaux). Aucun nouveau
// code n'est affiché ici : le staff n'a jamais besoin de connaître le code
// lui-même, le QR imprimé pointe vers l'URL fixe /accueil-preinscription,
// pas vers un code précis.
export function InvaliderCodeAccueilButton() {
  const [fait, setFait] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() => {
          setFait(false);
          startTransition(async () => {
            await invaliderCodeAccueilAction();
            setFait(true);
          });
        }}
      >
        {pending ? "Invalidation…" : "Invalider le code accueil du jour"}
      </Button>
      {fait && !pending && (
        <span className="text-xs text-sage">
          Fait — un nouveau code sera généré automatiquement au prochain scan du QR.
        </span>
      )}
    </div>
  );
}
