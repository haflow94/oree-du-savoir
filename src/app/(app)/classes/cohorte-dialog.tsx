"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { creerCohorteAction, modifierCohorteAction, supprimerCohorteAction } from "./actions";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ModalShell } from "@/components/ui/modal-shell";
import { Badge } from "@/components/ui/badge";
import { CONTROL_CLASSES, CONTROL_SM_CLASSES } from "@/components/ui/champ";
import { JOURS_ORDONNES, JOUR_LABELS } from "@/lib/planning";

const LABEL_SM_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";
const NIVEAUX_DATALIST_ID = "cohorte-niveaux-existants";

type Cohorte = {
  id: string;
  niveau: string | null;
  jour: (typeof JOURS_ORDONNES)[number];
  cours: { id: string; nom: string };
  _count: { classes: number };
};
type Cours = { id: string; nom: string; section: { id: string } };

// Catalogue amont Cours + Niveau + Jour, créé en amont d'une Classe (voir
// prisma/schema.prisma#Cohorte) — calqué sur CoursDialog ci-contre.
export function CohorteDialog({
  cohortes,
  cours,
  peutGerer,
  ouvrirAuChargement,
}: {
  cohortes: Cohorte[];
  cours: Cours[];
  peutGerer: boolean;
  ouvrirAuChargement: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (ouvrirAuChargement) dialogRef.current?.showModal();
  }, [ouvrirAuChargement]);

  // Un niveau (ex. "1ère année") se répète souvent sur plusieurs matières
  // (cours) d'une même section : on suggère les niveaux déjà utilisés dans
  // la section du cours choisi, pour éviter de le retaper à chaque cohorte
  // et le risque de variante orthographique (champ texte libre, voir
  // schema.prisma#Cohorte). Recalculé côté client, aucune requête en plus.
  const sectionIdParCours = useMemo(
    () => new Map(cours.map((c) => [c.id, c.section.id])),
    [cours],
  );
  const niveauxParSection = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of cohortes) {
      if (!c.niveau) continue;
      const sectionId = sectionIdParCours.get(c.cours.id);
      if (!sectionId) continue;
      if (!map.has(sectionId)) map.set(sectionId, new Set());
      map.get(sectionId)!.add(c.niveau);
    }
    return map;
  }, [cohortes, sectionIdParCours]);
  const [coursSelectionne, setCoursSelectionne] = useState("");
  const niveauxSuggeres = useMemo(() => {
    const sectionId = sectionIdParCours.get(coursSelectionne);
    if (!sectionId) return [];
    return [...(niveauxParSection.get(sectionId) ?? [])].sort((a, b) => a.localeCompare(b, "fr"));
  }, [coursSelectionne, sectionIdParCours, niveauxParSection]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonVariants({ variant: "secondary" })}
      >
        Cohortes ({cohortes.length})
      </button>
      <ModalShell dialogRef={dialogRef} title={<h3 className="text-sm font-semibold text-ink">Cohortes</h3>} maxWidth="max-w-2xl">
          <p className="mt-1 text-xs text-ink-faint">
            Une cohorte (cours + niveau + jour) est créée une fois puis
            réutilisée chaque année scolaire pour créer une classe.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {cohortes.length === 0 && <p className="text-sm text-ink-faint">Aucune cohorte enregistrée.</p>}
            {cohortes.map((c) =>
              peutGerer ? (
                <details key={c.id} className="rounded-lg border border-border px-3 py-1.5">
                  <summary className="cursor-pointer text-sm text-ink-muted">
                    {c.cours.nom}
                    {c.niveau ? ` — ${c.niveau}` : ""}
                    <span className="ml-1 text-xs text-ink-faint">({JOUR_LABELS[c.jour]})</span>
                  </summary>
                  <form action={modifierCohorteAction} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="cohorteId" value={c.id} />
                    <div>
                      <label className={LABEL_SM_CLASSES}>Cours</label>
                      <select name="coursId" required defaultValue={c.cours.id} className={CONTROL_SM_CLASSES}>
                        {cours.map((co) => (
                          <option key={co.id} value={co.id}>
                            {co.nom}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL_SM_CLASSES}>Niveau</label>
                      <input name="niveau" defaultValue={c.niveau ?? ""} className={CONTROL_SM_CLASSES} />
                    </div>
                    <div>
                      <label className={LABEL_SM_CLASSES}>Jour</label>
                      <select name="jour" required defaultValue={c.jour} className={CONTROL_SM_CLASSES}>
                        {JOURS_ORDONNES.map((j) => (
                          <option key={j} value={j}>
                            {JOUR_LABELS[j]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <SubmitButton variant="secondary" size="sm" pendingLabel="Enregistrement…">
                      Enregistrer
                    </SubmitButton>
                  </form>
                  <form action={supprimerCohorteAction} className="mt-2">
                    <input type="hidden" name="cohorteId" value={c.id} />
                    <button
                      type="submit"
                      disabled={c._count.classes > 0}
                      title={
                        c._count.classes > 0
                          ? "Des classes sont rattachées à cette cohorte : impossible de la supprimer."
                          : undefined
                      }
                      className="text-xs font-medium text-rust hover:underline disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline"
                    >
                      Supprimer cette cohorte
                    </button>
                  </form>
                </details>
              ) : (
                <Badge key={c.id} variant="neutral">
                  {c.cours.nom}
                  {c.niveau ? ` — ${c.niveau}` : ""} ({JOUR_LABELS[c.jour]})
                </Badge>
              ),
            )}
          </div>

          {peutGerer && (
            <>
              <form action={creerCohorteAction} className="mt-4 flex flex-wrap gap-2">
                <select
                  name="coursId"
                  required
                  defaultValue=""
                  className={CONTROL_CLASSES}
                  onChange={(e) => setCoursSelectionne(e.target.value)}
                >
                  <option value="" disabled>
                    Cours
                  </option>
                  {cours.map((co) => (
                    <option key={co.id} value={co.id}>
                      {co.nom}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  name="niveau"
                  placeholder="Niveau (optionnel)"
                  list={NIVEAUX_DATALIST_ID}
                  className={`w-full max-w-xs ${CONTROL_CLASSES}`}
                />
                <datalist id={NIVEAUX_DATALIST_ID}>
                  {niveauxSuggeres.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
                <select name="jour" required defaultValue="" className={CONTROL_CLASSES}>
                  <option value="" disabled>
                    Jour
                  </option>
                  {JOURS_ORDONNES.map((j) => (
                    <option key={j} value={j}>
                      {JOUR_LABELS[j]}
                    </option>
                  ))}
                </select>
                <SubmitButton variant="secondary" pendingLabel="Ajout…">
                  Ajouter
                </SubmitButton>
              </form>
              {cours.length === 0 && (
                <p className="mt-2 text-sm text-ochre">
                  Aucun cours enregistré : créez d&apos;abord un cours ci-dessus.
                </p>
              )}
            </>
          )}
      </ModalShell>
    </>
  );
}
