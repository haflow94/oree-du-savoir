"use client";

import { useState } from "react";
import Link from "next/link";
import { enregistrerPaiementUniqueAction, ajouterEcheanceAction } from "./actions";
import { ChampsMoyenPaiement } from "./champs-moyen-paiement";
import { ConfirmerPaiementButton } from "./confirmer-paiement-button";
import { Card, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonVariants } from "@/components/ui/button";

const CONTROL_SM_CLASSES =
  "rounded-md border border-border-strong bg-bg-elevated px-2 py-1.5 text-sm text-ink transition-colors focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";
const LABEL_XS_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

type Mode = "choix" | "unique" | "echeancier";

// Dossier tout juste créé (aucune échéance ni paiement, voir page.tsx) : ce
// choix ne se pose qu'une fois — dès qu'une échéance existe (créée par l'un
// ou l'autre chemin ci-dessous), la page repasse en gestion normale et ce
// composant ne se réaffiche plus jamais sur ce dossier.
export function ChoixModePaiement({
  dossierAnnuelId,
  montantDu,
  etudiantNom,
  etudiantPrenom,
}: {
  dossierAnnuelId: string;
  montantDu: number;
  etudiantNom: string;
  etudiantPrenom: string;
}) {
  const [mode, setMode] = useState<Mode>("choix");

  if (mode === "unique") {
    return (
      <Card>
        <CardTitle>Paiement en une fois</CardTitle>
        <form
          action={enregistrerPaiementUniqueAction}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="dossierAnnuelId" value={dossierAnnuelId} />
          <div>
            <label className={LABEL_XS_CLASSES}>Montant reçu</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="montant"
              required
              defaultValue={montantDu}
              className={`w-28 ${CONTROL_SM_CLASSES}`}
            />
          </div>
          <div>
            <label className={LABEL_XS_CLASSES}>Date du paiement</label>
            <input
              type="date"
              name="datePaiement"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className={CONTROL_SM_CLASSES}
            />
          </div>
          <ChampsMoyenPaiement etudiantNom={etudiantNom} etudiantPrenom={etudiantPrenom} />
          <ConfirmerPaiementButton />
        </form>
        <button
          type="button"
          onClick={() => setMode("choix")}
          className="mt-3 text-xs text-ink-faint hover:underline"
        >
          ← Revenir au choix
        </button>
      </Card>
    );
  }

  if (mode === "echeancier") {
    return (
      <Card>
        <CardTitle>Paiement en plusieurs fois</CardTitle>
        <p className="mt-1 text-xs text-ink-muted">
          Ajoutez une première échéance ; vous pourrez en ajouter d&apos;autres ensuite.
        </p>
        <form action={ajouterEcheanceAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="dossierAnnuelId" value={dossierAnnuelId} />
          <div>
            <label className={LABEL_XS_CLASSES}>Libellé</label>
            <input
              type="text"
              name="libelle"
              placeholder="ex. 1re échéance"
              className={CONTROL_SM_CLASSES}
            />
          </div>
          <div>
            <label className={LABEL_XS_CLASSES}>Montant</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="montant"
              required
              className={`w-28 ${CONTROL_SM_CLASSES}`}
            />
          </div>
          <div>
            <label className={LABEL_XS_CLASSES}>Date d&apos;échéance</label>
            <input type="date" name="dateEcheance" required className={CONTROL_SM_CLASSES} />
          </div>
          <SubmitButton variant="secondary">Ajouter</SubmitButton>
        </form>
        <button
          type="button"
          onClick={() => setMode("choix")}
          className="mt-3 text-xs text-ink-faint hover:underline"
        >
          ← Revenir au choix
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Comment la cotisation va-t-elle être payée ?</CardTitle>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("unique")}
          className={buttonVariants({ variant: "primary", size: "sm" })}
        >
          Paiement en une fois
        </button>
        <button
          type="button"
          onClick={() => setMode("echeancier")}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          Paiement en plusieurs fois
        </button>
        <Link href="/paiements" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Annuler
        </Link>
      </div>
    </Card>
  );
}
