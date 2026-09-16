"use client";

import { useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Champ, ChampTextarea } from "@/components/ui/champ";
import { SubmitButton } from "@/components/ui/submit-button";

// Contournement réservé au Bureau du garde-fou normal de suppression (voir
// supprimerEtudiantAction) : plus de friction qu'un ConfirmDialog classique
// puisque l'action efface définitivement un dossier signé, des paiements
// déjà encaissés ou des présences — retaper le nom complet évite un clic
// accidentel sur le même bouton qu'une suppression anodine.
export function ForcerSuppressionEtudiantDialog({
  action,
  etudiantId,
  nomComplet,
  motifsBlocage,
}: {
  action: (formData: FormData) => void;
  etudiantId: string;
  nomComplet: string;
  motifsBlocage: string[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [motif, setMotif] = useState("");
  const [confirmationNom, setConfirmationNom] = useState("");
  const nomConfirme = confirmationNom.trim().toLowerCase() === nomComplet.trim().toLowerCase();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonVariants({ variant: "danger", size: "sm" })}
      >
        Forcer la suppression (Bureau)
      </button>
      <dialog
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-full max-w-md rounded-xl border border-border bg-bg-elevated p-0 shadow-modal backdrop:bg-ink/40"
      >
        <form
          action={action}
          onSubmit={() => dialogRef.current?.close()}
          className="space-y-3 p-5"
        >
          <h3 className="text-sm font-semibold text-ink">Forcer la suppression de {nomComplet} ?</h3>
          <p className="text-sm text-rust">
            Action irréversible réservée au Bureau : {motifsBlocage.join(", ")} seront
            définitivement effacés (dont le PDF signé et les paiements/chèques enregistrés), sans
            aucun retour possible. Une éventuelle enveloppe de signature Documenso en cours sera
            annulée.
          </p>
          <input type="hidden" name="etudiantId" value={etudiantId} />
          <input type="hidden" name="force" value="1" />
          <ChampTextarea
            label="Motif (obligatoire, conservé dans le journal d'audit)"
            name="motif"
            required
            rows={2}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
          />
          <Champ
            label={`Retapez « ${nomComplet} » pour confirmer`}
            name="confirmationNom"
            required
            value={confirmationNom}
            onChange={(e) => setConfirmationNom(e.target.value)}
            autoComplete="off"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Annuler
            </button>
            <SubmitButton
              variant="danger"
              size="sm"
              pendingLabel="Suppression…"
              disabled={!nomConfirme || motif.trim().length === 0}
            >
              Forcer la suppression définitivement
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
