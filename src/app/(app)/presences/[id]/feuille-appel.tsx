"use client";

import { useState } from "react";
import {
  StatutPresence,
  STATUT_PRESENCE_LABELS,
} from "@/lib/presences";
import { validerPresencesAction } from "../actions";

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
  PRESENT: "bg-emerald-600 text-white",
  RETARD: "bg-amber-500 text-white",
  RETARD_EXCUSE: "bg-amber-400 text-white",
  ABSENT: "bg-red-600 text-white",
  ABSENT_EXCUSE: "bg-red-400 text-white",
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={() =>
              setStatuts(
                Object.fromEntries(lignes.map((l) => [l.etudiantId, "PRESENT"])),
              )
            }
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Tous présents
          </button>
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            {compte.map((c) => (
              <span key={c.statut} className="rounded-full bg-slate-100 px-2.5 py-1">
                {STATUT_PRESENCE_LABELS[c.statut]} : {c.n}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {lignes.map((l) => (
            <li
              key={l.etudiantId}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <span className="font-medium text-slate-800">
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
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
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
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
          Aucun étudiant inscrit dans cette classe. Ajoutez-les depuis la fiche
          de la classe avant de faire l&apos;appel.
        </p>
      )}

      {!lectureSeule && lignes.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="saisieViaPapier" value="1" />
            Saisie depuis la feuille papier
          </label>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {dejaValidee ? "Enregistrer la correction" : "Valider l'appel"}
          </button>
        </div>
      )}
    </form>
  );
}
