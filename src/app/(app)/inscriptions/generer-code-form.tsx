"use client";

import { useState, useTransition } from "react";
import { genererCodePreinscriptionAction } from "./actions";
import { Champ } from "@/components/ui/champ";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

// Même pattern que preinscription-form.tsx : l'action retourne un résultat
// au composant plutôt que de rediriger, pour afficher le code généré une
// seule fois (il n'est jamais stocké en clair, voir preinscription-code.ts)
// sans quitter la page.
//
// Un seul mode ici : campagne email ciblée. Le besoin "accueil" (même QR
// affiché sur place toute la journée) est désormais couvert automatiquement
// par /accueil-preinscription (voir src/app/accueil-preinscription/route.ts)
// — plus de génération manuelle à faire pour ça.
export function GenererCodeForm() {
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ code: string; lien: string; expireLe: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErreur(null);
          setResultat(null);
          // Capturé avant startTransition : React vide `e.currentTarget` une
          // fois l'événement géré, donc y accéder après un `await` dans le
          // callback (ex. pour un `.reset()` une fois la réponse reçue) lève
          // une TypeError une fois sur deux selon le timing.
          const formulaire = e.currentTarget;
          const formData = new FormData(formulaire);
          startTransition(async () => {
            const reponse = await genererCodePreinscriptionAction(formData);
            if ("erreur" in reponse) {
              setErreur(reponse.erreur);
            } else {
              setResultat(reponse);
              formulaire.reset();
            }
          });
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <Champ
          label="Libellé de la campagne"
          name="campagneLabel"
          placeholder="Relance rentrée 2026"
          required
          className="min-w-[14rem] flex-1"
        />
        <Champ
          label="Validité (jours)"
          name="joursValidite"
          type="number"
          min={1}
          max={90}
          defaultValue={14}
          required
          className="w-32"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Génération…" : "Générer un code"}
        </Button>
      </form>

      {erreur && <Alert variant="danger">{erreur}</Alert>}

      {resultat && (
        <Alert variant="success">
          <p className="font-medium">
            Code généré, valable jusqu&apos;au {resultat.expireLe} — à copier
            maintenant (il ne sera plus réaffiché ensuite) dans l&apos;e-mail
            envoyé à la famille :
          </p>
          <p className="mt-2 break-all font-mono text-sm">{resultat.code}</p>
          <p className="mt-1 break-all font-mono text-xs text-ink-muted">
            {typeof window !== "undefined" ? `${window.location.origin}${resultat.lien}` : resultat.lien}
          </p>
        </Alert>
      )}
    </div>
  );
}
