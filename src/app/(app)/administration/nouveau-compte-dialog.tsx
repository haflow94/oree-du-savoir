"use client";

import { useEffect, useRef } from "react";
import { creerUtilisateurAction } from "./actions";
import { Champ, ChampSelect } from "@/components/ui/champ";
import { Button, buttonVariants } from "@/components/ui/button";
import { LONGUEUR_MIN_MOT_DE_PASSE } from "@/lib/comptes";
import { Role, ROLE_LABELS, ROLES_STAFF } from "@/lib/roles";

// Seul point d'entrée pour créer un compte : un bouton qui ouvre ce
// formulaire dans une <dialog>, plutôt qu'une section toujours dépliée en
// haut de la page. Partagé entre Administration > Comptes (rôle choisi
// librement parmi ROLES_STAFF) et Administration > Enseignants (rôle fixé à
// ENSEIGNANT, voir `roleFixe`).
export function NouveauCompteDialog({
  ouvrirAuChargement,
  from,
  roleFixe,
  titre = "Créer un compte",
  triggerLabel = "+ Nouveau compte",
  sectionsDisponibles,
}: {
  ouvrirAuChargement: boolean;
  from?: string;
  roleFixe?: Role;
  titre?: string;
  triggerLabel?: string;
  // Fourni uniquement depuis Administration > Enseignants (roleFixe =
  // ENSEIGNANT) : affiche les cases à cocher de spécialité.
  sectionsDisponibles?: { id: string; nom: string }[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Rouvre automatiquement si l'action de création vient d'échouer (retour
  // avec ?error=... sans utilisateurId, voir actions.ts) : sans ça, le
  // message d'erreur s'afficherait en haut de page sans que le formulaire
  // fautif soit visible.
  useEffect(() => {
    if (ouvrirAuChargement) dialogRef.current?.showModal();
  }, [ouvrirAuChargement]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonVariants({ variant: "primary" })}
      >
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto w-full max-w-lg rounded-xl border border-border bg-bg-elevated p-0 shadow-modal backdrop:bg-ink/40"
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">{titre}</h3>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-ink-faint hover:text-ink"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
          <form action={creerUtilisateurAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            {from && <input type="hidden" name="from" value={from} />}
            <Champ label="Prénom" name="prenom" required />
            <Champ label="Nom" name="nom" required />
            <Champ
              label="Email"
              name="email"
              type="email"
              required
              autoComplete="off"
              className="sm:col-span-2"
            />
            {roleFixe ? (
              <input type="hidden" name="role" value={roleFixe} />
            ) : (
              <ChampSelect
                label="Rôle"
                name="role"
                required
                defaultValue={Role.ACCUEIL}
                className="sm:col-span-2"
              >
                {ROLES_STAFF.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </ChampSelect>
            )}
            {sectionsDisponibles && sectionsDisponibles.length > 0 && (
              <div className="sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-ink-muted">
                  Spécialité(s) (optionnel — laisser vide pour proposer cet
                  enseignant sur toutes les sections)
                </span>
                <div className="flex flex-wrap gap-3">
                  {sectionsDisponibles.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink-muted"
                    >
                      <input type="checkbox" name="specialites" value={s.id} />
                      {s.nom}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <Champ
              label={`Mot de passe initial (${LONGUEUR_MIN_MOT_DE_PASSE} caractères minimum)`}
              name="motDePasse"
              type="password"
              required
              minLength={LONGUEUR_MIN_MOT_DE_PASSE}
              autoComplete="new-password"
              hint="À communiquer à la personne concernée, qui devra le changer."
              className="sm:col-span-2"
            />
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className={buttonVariants({ variant: "secondary" })}
              >
                Annuler
              </button>
              <Button type="submit" variant="primary">
                Créer le compte
              </Button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
