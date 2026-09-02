"use client";

import { useState } from "react";
import { modifierClasseAction } from "./actions";
import type { JourSemaine } from "@/lib/planning";
import { JOUR_LABELS } from "@/lib/planning";
import type { EnseignantAvecSections } from "@/lib/enseignants-section";
import { Champ, ChampSelect } from "@/components/ui/champ";
import { SubmitButton } from "@/components/ui/submit-button";

const LABEL_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

type Cours = { id: string; nom: string; sectionId: string };
type Cohorte = {
  id: string;
  section: { id: string; nom: string };
  niveau: string | null;
  jour: JourSemaine;
  cours: Cours[];
};
type Salle = { id: string; nom: string };

// Client component : le choix de la cohorte détermine les Cours proposés
// (une Cohorte peut porter plusieurs Cours, voir Cohorte/CohorteCours), et le
// Cours choisi détermine la section qui filtre la liste des enseignants —
// même logique que classes/nouveau/nouvelle-classe-form.tsx, dupliquée ici
// car ce formulaire pré-remplit une Classe existante plutôt que d'en créer
// une (id caché, defaultValue partout).
export function ModifierClasseForm({
  classeId,
  cohorteId: cohorteIdInitiale,
  coursId: coursIdInitial,
  heureDebut,
  heureFin,
  semestre,
  salleId,
  cohortes,
  salles,
  enseignants,
  enseignantsAssignesIds,
}: {
  classeId: string;
  cohorteId: string;
  coursId: string;
  heureDebut: string;
  heureFin: string;
  semestre: string | null;
  salleId: string | null;
  cohortes: Cohorte[];
  salles: Salle[];
  enseignants: EnseignantAvecSections[];
  enseignantsAssignesIds: string[];
}) {
  const [cohorteId, setCohorteId] = useState(cohorteIdInitiale);
  const coursDeLaCohorte = cohortes.find((c) => c.id === cohorteId)?.cours ?? [];
  const [coursId, setCoursId] = useState(coursIdInitial);

  // Si la cohorte change et que le cours sélectionné n'en fait plus partie,
  // on retombe sur le premier cours du nouveau bloc — ajusté pendant le
  // rendu (pattern React recommandé) plutôt que dans un useEffect, pour
  // éviter un rendu supplémentaire après coup.
  const [cohorteIdPourCoursId, setCohorteIdPourCoursId] = useState(cohorteId);
  if (cohorteId !== cohorteIdPourCoursId) {
    setCohorteIdPourCoursId(cohorteId);
    setCoursId(coursDeLaCohorte[0]?.id ?? "");
  }

  const sectionId = coursDeLaCohorte.find((c) => c.id === coursId)?.sectionId;
  const assignes = new Set(enseignantsAssignesIds);
  const enseignantsVisibles = enseignants.filter(
    (e) => assignes.has(e.id) || !sectionId || e.sectionIds.length === 0 || e.sectionIds.includes(sectionId),
  );

  return (
    <form action={modifierClasseAction} className="space-y-4">
      <input type="hidden" name="classeId" value={classeId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <ChampSelect
          label="Cohorte"
          name="cohorteId"
          required
          value={cohorteId}
          onChange={(e) => setCohorteId(e.target.value)}
        >
          {cohortes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.section.nom}
              {c.niveau ? ` — ${c.niveau}` : ""} · {JOUR_LABELS[c.jour]}
            </option>
          ))}
        </ChampSelect>
        <ChampSelect
          label="Cours de ce bloc"
          name="coursId"
          required
          disabled={coursDeLaCohorte.length === 0}
          value={coursId}
          onChange={(e) => setCoursId(e.target.value)}
        >
          {coursDeLaCohorte.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </ChampSelect>
        <ChampSelect label="Semestre (optionnel)" name="semestre" defaultValue={semestre ?? ""}>
          <option value="">Toute l&apos;année</option>
          <option value="1">Semestre 1</option>
          <option value="2">Semestre 2</option>
        </ChampSelect>
        <ChampSelect label="Salle (optionnel)" name="salleId" defaultValue={salleId ?? ""}>
          <option value="">Aucune salle</option>
          {salles.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </ChampSelect>
        <Champ label="Heure de début" type="time" name="heureDebut" required defaultValue={heureDebut} />
        <Champ label="Heure de fin" type="time" name="heureFin" required defaultValue={heureFin} />
      </div>

      {coursDeLaCohorte.length === 0 && (
        <p className="text-sm text-ochre">
          Cette cohorte n&apos;a pas encore de cours affecté. Affectez-en un
          depuis Classes → Cohortes avant d&apos;enregistrer.
        </p>
      )}

      <div>
        <label className={LABEL_CLASSES}>Enseignant(s)</label>
        {enseignantsVisibles.length === 0 ? (
          <p className="text-sm text-ink-faint">Aucun compte Enseignant actif.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {enseignantsVisibles.map((e) => (
              <label
                key={e.id}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink-muted"
              >
                <input
                  type="checkbox"
                  name="enseignants"
                  value={e.id}
                  defaultChecked={assignes.has(e.id)}
                />
                {e.prenom} {e.nom}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <SubmitButton variant="primary">Enregistrer</SubmitButton>
      </div>
    </form>
  );
}
