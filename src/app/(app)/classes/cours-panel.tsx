"use client";

import { useMemo, useState } from "react";
import { creerCoursAction, modifierCoursAction, supprimerCoursAction } from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { CONTROL_CLASSES, CONTROL_SM_CLASSES } from "@/components/ui/champ";

const LABEL_SM_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

type Cours = {
  id: string;
  nom: string;
  section: { id: string; nom: string };
  _count: { cohortesLiees: number; classes: number };
};
type Section = { id: string; nom: string };

// Contenu de l'onglet "Cours" du StructureDialog (voir classes/structure-dialog.tsx).
// Composant pur (pas de <dialog>, pas de bouton déclencheur) pour rester
// réutilisable indépendamment de la coquille modale.
export function CoursPanel({
  cours,
  sections,
  peutGerer,
}: {
  cours: Cours[];
  sections: Section[];
  peutGerer: boolean;
}) {
  const [recherche, setRecherche] = useState("");
  const coursFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return cours;
    return cours.filter(
      (c) => c.nom.toLowerCase().includes(q) || c.section.nom.toLowerCase().includes(q),
    );
  }, [cours, recherche]);
  // Regroupé par Section (dans l'ordre de la liste des sections) plutôt
  // qu'en vrac : une association avec plusieurs sections mélangeait sinon
  // tous ses cours dans un même nuage de badges, sans repère visuel entre
  // domaines d'enseignement distincts (voir Section dans schema.prisma).
  const groupesParSection = sections
    .map((s) => ({ section: s, items: coursFiltres.filter((c) => c.section.id === s.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mt-3">
      {cours.length > 5 && (
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un cours…"
          className={`mb-3 w-full max-w-xs ${CONTROL_SM_CLASSES}`}
        />
      )}
      {cours.length === 0 && <p className="text-sm text-ink-faint">Aucun cours enregistré.</p>}
      {cours.length > 0 && coursFiltres.length === 0 && (
        <p className="text-sm text-ink-faint">Aucun cours ne correspond à « {recherche} ».</p>
      )}
      <div className="space-y-3">
        {groupesParSection.map(({ section, items }) => (
          <div key={section.id}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {section.nom}
            </p>
            <div className="flex flex-wrap gap-2">
              {items.map((c) =>
                peutGerer ? (
                  <details key={c.id} className="rounded-lg border border-border px-3 py-1.5">
                    <summary className="cursor-pointer text-sm text-ink-muted">{c.nom}</summary>
                    <form action={modifierCoursAction} className="mt-3 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="coursId" value={c.id} />
                      <div>
                        <label className={LABEL_SM_CLASSES}>Nom</label>
                        <input name="nom" required defaultValue={c.nom} className={CONTROL_SM_CLASSES} />
                      </div>
                      <div>
                        <label className={LABEL_SM_CLASSES}>Section</label>
                        <select
                          name="sectionId"
                          required
                          defaultValue={c.section.id}
                          className={CONTROL_SM_CLASSES}
                        >
                          {sections.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nom}
                            </option>
                          ))}
                        </select>
                      </div>
                      <SubmitButton variant="secondary" size="sm" pendingLabel="Enregistrement…">
                        Enregistrer
                      </SubmitButton>
                    </form>
                    <form action={supprimerCoursAction} className="mt-2">
                      <input type="hidden" name="coursId" value={c.id} />
                      <button
                        type="submit"
                        disabled={c._count.cohortesLiees > 0 || c._count.classes > 0}
                        title={
                          c._count.cohortesLiees > 0 || c._count.classes > 0
                            ? "Des cohortes ou des classes utilisent ce cours : impossible de le supprimer."
                            : undefined
                        }
                        className="text-xs font-medium text-rust hover:underline disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline"
                      >
                        Supprimer ce cours
                      </button>
                    </form>
                  </details>
                ) : (
                  <Badge key={c.id} variant="neutral">
                    {c.nom}
                  </Badge>
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      {peutGerer && (
        <>
          <form action={creerCoursAction} className="mt-4 flex flex-wrap gap-2">
            <input
              type="text"
              name="nom"
              required
              placeholder="Nom du nouveau cours"
              className={`w-full max-w-xs ${CONTROL_CLASSES}`}
            />
            <select name="sectionId" required defaultValue="" className={CONTROL_CLASSES}>
              <option value="" disabled>
                Section
              </option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
            <SubmitButton variant="secondary" pendingLabel="Ajout…">
              Ajouter
            </SubmitButton>
          </form>
          {sections.length === 0 && (
            <p className="mt-2 text-sm text-ochre">
              Aucune section enregistrée : exécutez le seed (
              <code>npm run db:seed</code>) avant de créer un cours.
            </p>
          )}
        </>
      )}
    </div>
  );
}
