"use client";

import { useEffect, useRef } from "react";
import { ChevronRight, Repeat } from "lucide-react";
import { modifierActiviteAction, supprimerActiviteAction, supprimerSerieActiviteAction } from "./actions";
import { FREQUENCE_LABELS, FrequenceActivite } from "@/lib/activites-recurrence";
import { Champ, ChampTextarea } from "@/components/ui/champ";
import { SubmitButton } from "@/components/ui/submit-button";
import { ModalShell } from "@/components/ui/modal-shell";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export type ActiviteLigne = {
  id: string;
  titre: string;
  contenu: string | null;
  date: Date;
  dateFin: Date | null;
  heureDebut: string | null;
  heureFin: string | null;
  lieu: string | null;
  frequence: FrequenceActivite;
  dateFinRecurrence: Date | null;
  serieId: string | null;
  responsables: { utilisateur: { id: string; prenom: string; nom: string; role: string } }[];
};

type Responsable = { id: string; prenom: string; nom: string };

function versChampDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Une ligne compacte (titre, date, lieu) qui ouvre la modification et la
// suppression dans une <dialog> au clic, plutôt qu'un formulaire déplié en
// permanence par activité (même pattern que administration/utilisateur-row.tsx).
export function ActiviteRow({
  activite: a,
  dansFenetreDeRappel,
  ouvrirAuChargement,
  peutGerer,
  responsablesDisponibles,
}: {
  activite: ActiviteLigne;
  dansFenetreDeRappel: boolean;
  ouvrirAuChargement: boolean;
  peutGerer: boolean;
  responsablesDisponibles: Responsable[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formSuppressionId = `supprimer-activite-${a.id}`;
  const formSuppressionSerieId = `supprimer-serie-activite-${a.id}`;
  const responsableIds = new Set(a.responsables.map((r) => r.utilisateur.id));

  useEffect(() => {
    if (ouvrirAuChargement) dialogRef.current?.showModal();
  }, [ouvrirAuChargement]);

  const horaire = a.heureDebut ? `${a.heureDebut}${a.heureFin ? `–${a.heureFin}` : ""}` : null;

  const contenuLigne = (
    <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 font-medium text-ink">
          <span className="truncate">{a.titre}</span>
          {a.frequence !== FrequenceActivite.AUCUNE && (
            <Repeat aria-label="Activité récurrente" className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
          )}
          {dansFenetreDeRappel && <Badge variant="info">Rappel actif</Badge>}
        </div>
        <div className="truncate text-sm text-ink-muted">
          {[a.lieu, horaire].filter(Boolean).join(" · ")}
          {a.responsables.length > 0 &&
            ` · ${a.responsables.map((r) => `${r.utilisateur.prenom} ${r.utilisateur.nom}`).join(", ")}`}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-ink-muted">
          {new Date(a.date).toLocaleDateString("fr-FR", {
            weekday: "short",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
        {peutGerer && <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />}
      </div>
    </div>
  );

  if (!peutGerer) {
    return <div className="hover:bg-bg-sunken/40">{contenuLigne}</div>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="block w-full hover:bg-bg-sunken/40"
      >
        {contenuLigne}
      </button>

      <ModalShell dialogRef={dialogRef} title={<h3 className="text-sm font-semibold text-ink">{a.titre}</h3>}>
          {a.frequence !== FrequenceActivite.AUCUNE && (
            <p className="mt-2 text-xs text-ink-faint">
              Fait partie d&apos;une série : {FREQUENCE_LABELS[a.frequence].toLowerCase()}
              {a.dateFinRecurrence && ` jusqu'au ${versChampDate(a.dateFinRecurrence)}`}. La récurrence
              n&apos;est modifiable qu&apos;à la création ; chaque occurrence se modifie/supprime
              individuellement ci-dessous.
            </p>
          )}

          <form action={modifierActiviteAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="activiteId" value={a.id} />
            <Champ label="Titre" name="titre" required defaultValue={a.titre} className="sm:col-span-2" />
            <Champ label="Lieu" name="lieu" defaultValue={a.lieu ?? ""} placeholder="Optionnel" className="sm:col-span-2" />

            <Champ label="Date de début" name="date" type="date" required defaultValue={versChampDate(a.date)} />
            <Champ
              label="Date de fin"
              name="dateFin"
              type="date"
              defaultValue={a.dateFin ? versChampDate(a.dateFin) : ""}
              hint="Si l'activité dure plusieurs jours"
            />
            <Champ label="Heure de début" name="heureDebut" type="time" defaultValue={a.heureDebut ?? ""} hint="Optionnel" />
            <Champ label="Heure de fin" name="heureFin" type="time" defaultValue={a.heureFin ?? ""} hint="Optionnel" />

            <ChampTextarea
              label="Contenu"
              name="contenu"
              rows={4}
              defaultValue={a.contenu ?? ""}
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
                      <input
                        type="checkbox"
                        name="responsables"
                        value={r.id}
                        defaultChecked={responsableIds.has(r.id)}
                      />
                      {r.prenom} {r.nom}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end sm:col-span-2">
              <SubmitButton variant="primary" pendingLabel="Enregistrement…">
                Enregistrer
              </SubmitButton>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            {a.serieId && (
              <>
                <form id={formSuppressionSerieId} action={supprimerSerieActiviteAction}>
                  <input type="hidden" name="activiteId" value={a.id} />
                </form>
                <ConfirmDialog
                  formId={formSuppressionSerieId}
                  triggerLabel="Supprimer cette occurrence et les suivantes"
                  title="Supprimer cette occurrence et les suivantes ?"
                  description="Toutes les occurrences de la série à partir de cette date sont supprimées définitivement. Les occurrences passées de la série sont conservées."
                  confirmLabel="Supprimer la série"
                />
              </>
            )}
            <form id={formSuppressionId} action={supprimerActiviteAction}>
              <input type="hidden" name="activiteId" value={a.id} />
            </form>
            <ConfirmDialog
              formId={formSuppressionId}
              triggerLabel="Supprimer cette occurrence"
              title="Supprimer cette activité ?"
              description="Cette action supprime définitivement l'activité et ne peut pas être annulée."
              confirmLabel="Supprimer définitivement"
            />
          </div>
      </ModalShell>
    </>
  );
}
