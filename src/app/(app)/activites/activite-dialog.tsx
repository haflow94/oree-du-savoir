"use client";

import { useEffect, useRef, useState } from "react";
import { creerActiviteAction } from "./actions";
import { FREQUENCE_LABELS, FrequenceActivite, MAX_OCCURRENCES_SERIE } from "@/lib/activites-recurrence";
import { Champ, ChampSelect, ChampTextarea } from "@/components/ui/champ";
import { Button, buttonVariants } from "@/components/ui/button";

type Responsable = { id: string; prenom: string; nom: string };

// Seul point d'entrée pour créer une activité : un bouton qui ouvre ce
// formulaire dans une <dialog>, plutôt qu'une section toujours dépliée en
// haut de la page (même pattern que le compte utilisateur, voir
// administration/nouveau-compte-dialog.tsx).
export function NouvelleActiviteDialog({
  ouvrirAuChargement,
  responsablesDisponibles,
}: {
  ouvrirAuChargement: boolean;
  responsablesDisponibles: Responsable[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [frequence, setFrequence] = useState<FrequenceActivite>(FrequenceActivite.AUCUNE);

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
        + Nouvelle activité
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto w-full max-w-lg rounded-xl border border-border bg-bg-elevated p-0 shadow-modal backdrop:bg-ink/40"
      >
        <div className="max-h-[85vh] overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Créer une activité</h3>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-ink-faint hover:text-ink"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
          <form action={creerActiviteAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Champ label="Titre" name="titre" required className="sm:col-span-2" />
            <Champ label="Lieu" name="lieu" placeholder="Optionnel" className="sm:col-span-2" />

            <Champ label="Date de début" name="date" type="date" required />
            <Champ label="Date de fin" name="dateFin" type="date" hint="Si l'activité dure plusieurs jours" />
            <Champ label="Heure de début" name="heureDebut" type="time" hint="Optionnel" />
            <Champ label="Heure de fin" name="heureFin" type="time" hint="Optionnel" />

            <ChampSelect
              label="Récurrence"
              name="frequence"
              value={frequence}
              onChange={(e) => setFrequence(e.target.value as FrequenceActivite)}
            >
              {Object.entries(FREQUENCE_LABELS).map(([valeur, label]) => (
                <option key={valeur} value={valeur}>
                  {label}
                </option>
              ))}
            </ChampSelect>
            {frequence !== FrequenceActivite.AUCUNE && (
              <Champ
                label="Se répète jusqu'au"
                name="dateFinRecurrence"
                type="date"
                required
                hint={`${MAX_OCCURRENCES_SERIE} occurrences maximum`}
              />
            )}

            <ChampTextarea
              label="Contenu"
              name="contenu"
              rows={4}
              placeholder="Détails visibles sur le calendrier (optionnel)"
              className="sm:col-span-2"
            />

            <div className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-ink-muted">
                Responsable(s) / gestionnaire(s)
              </span>
              {responsablesDisponibles.length === 0 ? (
                <p className="text-sm text-ink-faint">
                  Aucun compte responsable d&apos;activités pour l&apos;instant (voir
                  Administration → Responsables d&apos;activités).
                </p>
              ) : (
                <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
                  {responsablesDisponibles.map((r) => (
                    <label
                      key={r.id}
                      className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-ink-muted"
                    >
                      <input type="checkbox" name="responsables" value={r.id} />
                      {r.prenom} {r.nom}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 sm:col-span-2">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className={buttonVariants({ variant: "secondary" })}
              >
                Annuler
              </button>
              <Button type="submit" variant="primary">
                Créer l&apos;activité
              </Button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
