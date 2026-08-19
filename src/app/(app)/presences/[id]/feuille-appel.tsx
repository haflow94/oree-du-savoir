"use client";

import { useState } from "react";
import {
  StatutPresence,
  STATUT_PRESENCE_LABELS,
} from "@/lib/presences";
import { validerPresencesAction } from "../actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export type LigneAppel = {
  etudiantId: string;
  nom: string;
  prenom: string;
  statutInitial: StatutPresence | null;
};

const ORDRE: StatutPresence[] = [
  "PRESENT",
  "RETARD",
  "RETARD_EXCUSE",
  "ABSENT",
  "ABSENT_EXCUSE",
];

const COULEURS: Record<StatutPresence, string> = {
  PRESENT: "bg-sage text-on-accent",
  RETARD: "bg-ochre text-on-accent",
  RETARD_EXCUSE: "bg-ochre/70 text-on-accent",
  ABSENT: "bg-rust text-on-accent",
  ABSENT_EXCUSE: "bg-rust/70 text-on-accent",
};

export function FeuilleAppel({
  seanceId,
  lignes,
  lectureSeule,
  dejaValidee,
}: {
  seanceId: string;
  lignes: LigneAppel[];
  lectureSeule: boolean;
  dejaValidee: boolean;
}) {
  // « Tous présents » est le point de départ : l'enseignant ne saisit que les
  // exceptions. Rien n'est écrit en base tant qu'il n'a pas validé.
  const [statuts, setStatuts] = useState<Record<string, StatutPresence>>(() =>
    Object.fromEntries(
      lignes.map((l) => [l.etudiantId, l.statutInitial ?? "PRESENT"]),
    ),
  );

  const compte = ORDRE.map((s) => ({
    statut: s,
    n: Object.values(statuts).filter((v) => v === s).length,
  })).filter((c) => c.n > 0);

  return (
    <form action={validerPresencesAction} className="space-y-4">
      <input type="hidden" name="seanceId" value={seanceId} />

      {!lectureSeule && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <Button
            type="button"
            variant="primary"
            onClick={() =>
              setStatuts(
                Object.fromEntries(lignes.map((l) => [l.etudiantId, "PRESENT"])),
              )
            }
          >
            Tous présents
          </Button>
          <div className="flex flex-wrap gap-2">
            {compte.map((c) => (
              <Badge key={c.statut} variant="neutral">
                {STATUT_PRESENCE_LABELS[c.statut]} : {c.n}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-card">
        <ul className="divide-y divide-border">
          {lignes.map((l) => (
            <li
              key={l.etudiantId}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <span className="font-medium text-ink">
                {l.prenom} {l.nom}
              </span>
              <input
                type="hidden"
                name={`statut_${l.etudiantId}`}
                value={statuts[l.etudiantId]}
              />
              <div className="flex flex-wrap gap-1.5">
                {ORDRE.map((s) => {
                  const actif = statuts[l.etudiantId] === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={lectureSeule}
                      onClick={() =>
                        setStatuts((prec) => ({ ...prec, [l.etudiantId]: s }))
                      }
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                        actif
                          ? COULEURS[s]
                          : "bg-bg-sunken text-ink-muted hover:bg-border"
                      }`}
                    >
                      {STATUT_PRESENCE_LABELS[s]}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {lignes.length === 0 && (
        <EmptyState
          message="Aucun étudiant inscrit dans cette classe."
          hint="Ajoutez-les depuis la fiche de la classe avant de faire l'appel."
        />
      )}

      {!lectureSeule && lignes.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" name="saisieViaPapier" value="1" />
            Saisie depuis la feuille papier
          </label>
          <Button type="submit" variant="primary">
            {dejaValidee ? "Enregistrer la correction" : "Valider l'appel"}
          </Button>
        </div>
      )}
    </form>
  );
}
