"use client";

import { useState } from "react";
import Link from "next/link";
import { creerClasseAction } from "./actions";
import type { JourSemaine } from "@/lib/planning";
import { JOUR_LABELS } from "@/lib/planning";
import type { EnseignantAvecSections } from "@/lib/enseignants-section";
import { filtrerParSection } from "@/lib/enseignants-section";
import { Champ, ChampSelect } from "@/components/ui/champ";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

const FIELDSET_CLASSES = "rounded-xl border border-border bg-bg-elevated p-5 shadow-card";
const LEGEND_CLASSES = "px-1 text-sm font-semibold text-ink";

type Cohorte = {
  id: string;
  niveau: string | null;
  jour: JourSemaine;
  cours: { id: string; nom: string; sectionId: string };
};
type Annee = { id: string; libelle: string; active: boolean };
type Salle = { id: string; nom: string };
type Source = {
  cohorteId: string;
  semestre: string | null;
  heureDebut: string;
  heureFin: string;
  salleId: string | null;
} | null;

// Client component : le choix de la cohorte détermine la section de son
// cours, qui filtre la liste des enseignants proposés juste en dessous (voir
// lib/enseignants.ts#filtrerParSection) — nécessite un état partagé entre
// les deux champs, impossible en composant serveur pur sans recharger la
// page (et perdre le reste du formulaire déjà rempli).
export function NouvelleClasseForm({
  cohortes,
  annees,
  enseignants,
  source,
  anneeParDefaut,
  salles,
}: {
  cohortes: Cohorte[];
  annees: Annee[];
  enseignants: EnseignantAvecSections[];
  source: Source;
  anneeParDefaut: string | undefined;
  salles: Salle[];
}) {
  const [cohorteId, setCohorteId] = useState(source?.cohorteId ?? cohortes[0]?.id ?? "");
  const sectionId = cohortes.find((c) => c.id === cohorteId)?.cours.sectionId;
  const enseignantsVisibles = filtrerParSection(enseignants, sectionId);

  return (
    <form action={creerClasseAction} className="space-y-6">
      <fieldset className={FIELDSET_CLASSES}>
        <legend className={LEGEND_CLASSES}>Cohorte</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampSelect
            label="Cohorte"
            name="cohorteId"
            required
            value={cohorteId}
            onChange={(e) => setCohorteId(e.target.value)}
          >
            {cohortes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.cours.nom}
                {c.niveau ? ` — ${c.niveau}` : ""} · {JOUR_LABELS[c.jour]}
              </option>
            ))}
          </ChampSelect>
          <ChampSelect
            label="Année scolaire"
            name="anneeScolaireId"
            required
            defaultValue={anneeParDefaut}
          >
            {annees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.libelle}
                {a.active ? " (active)" : ""}
              </option>
            ))}
          </ChampSelect>
          <ChampSelect label="Semestre (optionnel)" name="semestre" defaultValue={source?.semestre ?? ""}>
            <option value="">Toute l&apos;année</option>
            <option value="1">Semestre 1</option>
            <option value="2">Semestre 2</option>
          </ChampSelect>
        </div>
      </fieldset>

      <fieldset className={FIELDSET_CLASSES}>
        <legend className={LEGEND_CLASSES}>Créneau</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ
            label="Heure de début"
            name="heureDebut"
            type="time"
            required
            defaultValue={source?.heureDebut ?? ""}
          />
          <Champ
            label="Heure de fin"
            name="heureFin"
            type="time"
            required
            defaultValue={source?.heureFin ?? ""}
          />
        </div>
      </fieldset>

      <fieldset className={FIELDSET_CLASSES}>
        <legend className={LEGEND_CLASSES}>Salle</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampSelect label="Salle (optionnel)" name="salleId" defaultValue={source?.salleId ?? ""}>
            <option value="">Aucune salle</option>
            {salles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </ChampSelect>
        </div>
        {salles.length === 0 && (
          <p className="mt-2 text-xs text-ink-faint">
            Aucune salle enregistrée. Créez-en une depuis Administration →
            Salles.
          </p>
        )}
      </fieldset>

      <fieldset className={FIELDSET_CLASSES}>
        <legend className={LEGEND_CLASSES}>Enseignant(s)</legend>
        {enseignants.length === 0 ? (
          <p className="text-sm text-ink-faint">
            Aucun compte avec le rôle Enseignant pour l&apos;instant (voir
            Administration → Enseignants).
          </p>
        ) : enseignantsVisibles.length === 0 ? (
          <p className="text-sm text-ink-faint">
            Aucun enseignant déjà rattaché à cette section. Créez la classe
            sans enseignant puis affectez-en un depuis sa fiche, ou choisissez
            un autre cours.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {enseignantsVisibles.map((e) => (
              <label
                key={e.id}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink-muted"
              >
                <input type="checkbox" name="enseignants" value={e.id} />
                {e.prenom} {e.nom}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="flex justify-end gap-3">
        <Link href="/classes" className={buttonVariants({ variant: "secondary" })}>
          Annuler
        </Link>
        <SubmitButton variant="primary" pendingLabel="Création…">
          {source ? "Créer cette copie" : "Créer la classe"}
        </SubmitButton>
      </div>
    </form>
  );
}
