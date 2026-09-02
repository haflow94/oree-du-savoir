"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { creerCohorteAction, modifierCohorteAction, supprimerCohorteAction } from "./actions";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ModalShell } from "@/components/ui/modal-shell";
import { Badge } from "@/components/ui/badge";
import { CONTROL_CLASSES, CONTROL_SM_CLASSES } from "@/components/ui/champ";
import { JOURS_ORDONNES, JOUR_LABELS } from "@/lib/planning";

const LABEL_SM_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";
const NIVEAUX_DATALIST_ID = "cohorte-niveaux-existants";

type Section = { id: string; nom: string };
type Cohorte = {
  id: string;
  section: Section;
  niveau: string | null;
  jour: (typeof JOURS_ORDONNES)[number];
  capaciteMax: number | null;
  cours: { id: string; nom: string }[];
  _count: { classes: number };
};
type Cours = { id: string; nom: string; section: { id: string } };

function libelleCohorte(c: Pick<Cohorte, "section" | "niveau" | "jour">) {
  return `${c.section.nom}${c.niveau ? ` — ${c.niveau}` : ""} (${JOUR_LABELS[c.jour]})`;
}

// Catalogue amont Section + Niveau + Jour, créé en amont d'une Classe (voir
// prisma/schema.prisma#Cohorte) — calqué sur CoursDialog ci-contre. Les
// Cours sont affectés à une Cohorte existante, jamais l'inverse : une
// Cohorte peut exister sans aucun cours.
export function CohorteDialog({
  cohortes,
  cours,
  sections,
  joursActifs,
  peutGerer,
  ouvrirAuChargement,
}: {
  cohortes: Cohorte[];
  cours: Cours[];
  sections: Section[];
  joursActifs: (typeof JOURS_ORDONNES)[number][];
  peutGerer: boolean;
  ouvrirAuChargement: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (ouvrirAuChargement) dialogRef.current?.showModal();
  }, [ouvrirAuChargement]);

  // Un niveau (ex. "1ère année") se répète souvent sur plusieurs cohortes
  // d'une même section : on suggère les niveaux déjà utilisés dans la
  // section choisie, pour éviter de le retaper et le risque de variante
  // orthographique (champ texte libre, voir schema.prisma#Cohorte).
  const niveauxParSection = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of cohortes) {
      if (!c.niveau) continue;
      if (!map.has(c.section.id)) map.set(c.section.id, new Set());
      map.get(c.section.id)!.add(c.niveau);
    }
    return map;
  }, [cohortes]);
  const [sectionSelectionnee, setSectionSelectionnee] = useState("");
  const niveauxSuggeres = useMemo(
    () =>
      [...(niveauxParSection.get(sectionSelectionnee) ?? [])].sort((a, b) => a.localeCompare(b, "fr")),
    [sectionSelectionnee, niveauxParSection],
  );
  const coursDeLaSection = cours.filter((co) => co.section.id === sectionSelectionnee);

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
            Une cohorte (section + niveau + jour, ex. un même groupe
            d&apos;enfants qui tourne entre plusieurs matières sur un même
            créneau) est créée une fois, seule, puis on lui affecte un ou
            plusieurs cours — réutilisée chaque année scolaire pour créer une
            ou plusieurs classes.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {cohortes.length === 0 && <p className="text-sm text-ink-faint">Aucune cohorte enregistrée.</p>}
            {cohortes.map((c) =>
              peutGerer ? (
                <details key={c.id} className="rounded-lg border border-border px-3 py-1.5">
                  <summary className="cursor-pointer text-sm text-ink-muted">
                    {libelleCohorte(c)}
                    {c.capaciteMax !== null && (
                      <span className="ml-1 text-xs text-ink-faint">· max {c.capaciteMax}</span>
                    )}
                  </summary>
                  <p className="mt-1 text-xs text-ink-faint">
                    Cours affectés :{" "}
                    {c.cours.length > 0 ? c.cours.map((co) => co.nom).join(", ") : "aucun pour l'instant"}
                  </p>
                  <form action={modifierCohorteAction} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="cohorteId" value={c.id} />
                    {c.cours.length > 0 ? (
                      <div>
                        <label className={LABEL_SM_CLASSES}>Section</label>
                        <input type="hidden" name="sectionId" value={c.section.id} />
                        <p className={`${CONTROL_SM_CLASSES} flex items-center bg-bg-sunken text-ink-faint`}>
                          {c.section.nom}
                        </p>
                        <p className="mt-0.5 text-[11px] text-ink-faint">
                          Verrouillée : des cours y sont déjà affectés.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <label className={LABEL_SM_CLASSES}>Section</label>
                        <select name="sectionId" required defaultValue={c.section.id} className={CONTROL_SM_CLASSES}>
                          {sections.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nom}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className={LABEL_SM_CLASSES}>Cours affectés</label>
                      <div className="flex flex-wrap gap-2">
                        {cours
                          .filter((co) => co.section.id === c.section.id)
                          .map((co) => (
                            <label
                              key={co.id}
                              className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs text-ink-muted"
                            >
                              <input
                                type="checkbox"
                                name="coursIds"
                                value={co.id}
                                defaultChecked={c.cours.some((cc) => cc.id === co.id)}
                              />
                              {co.nom}
                            </label>
                          ))}
                        {cours.filter((co) => co.section.id === c.section.id).length === 0 && (
                          <p className="text-xs text-ink-faint">Aucun cours dans cette section.</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className={LABEL_SM_CLASSES}>Niveau</label>
                      <input name="niveau" defaultValue={c.niveau ?? ""} className={CONTROL_SM_CLASSES} />
                    </div>
                    <div>
                      <label className={LABEL_SM_CLASSES}>Jour</label>
                      <select name="jour" required defaultValue={c.jour} className={CONTROL_SM_CLASSES}>
                        {/* Le jour actuel de la cohorte reste toujours sélectionnable ici même
                            s'il a depuis été retiré des jours d'ouverture (Administration →
                            Organisation), pour ne pas bloquer l'édition d'une cohorte existante. */}
                        {(joursActifs.includes(c.jour) ? joursActifs : [...joursActifs, c.jour]).map((j) => (
                          <option key={j} value={j}>
                            {JOUR_LABELS[j]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL_SM_CLASSES}>Capacité max (vide = illimitée)</label>
                      <input
                        type="number"
                        name="capaciteMax"
                        min={1}
                        defaultValue={c.capaciteMax ?? ""}
                        className={`w-28 ${CONTROL_SM_CLASSES}`}
                      />
                    </div>
                    <SubmitButton variant="secondary" size="sm" pendingLabel="Enregistrement…">
                      Enregistrer
                    </SubmitButton>
                  </form>
                  <div className="mt-2 flex items-center gap-3">
                    <Link
                      href={`/classes/cohortes/${c.id}`}
                      className="text-xs font-medium text-pine hover:underline"
                    >
                      Voir l&apos;occupation et la liste d&apos;attente →
                    </Link>
                    <form action={supprimerCohorteAction}>
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
                  </div>
                </details>
              ) : (
                <Badge key={c.id} variant="neutral">
                  {libelleCohorte(c)}
                </Badge>
              ),
            )}
          </div>

          {peutGerer && (
            <>
              <form action={creerCohorteAction} className="mt-4 space-y-2">
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className={LABEL_SM_CLASSES}>Section</label>
                    <select
                      name="sectionId"
                      required
                      value={sectionSelectionnee}
                      onChange={(e) => setSectionSelectionnee(e.target.value)}
                      className={CONTROL_CLASSES}
                    >
                      <option value="" disabled>
                        Section
                      </option>
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nom}
                        </option>
                      ))}
                    </select>
                  </div>
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
                    {joursActifs.map((j) => (
                      <option key={j} value={j}>
                        {JOUR_LABELS[j]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    name="capaciteMax"
                    min={1}
                    placeholder="Capacité (optionnel)"
                    className={`w-40 ${CONTROL_CLASSES}`}
                  />
                </div>
                {sectionSelectionnee && (
                  <div>
                    <label className={LABEL_SM_CLASSES}>
                      Cours à affecter (optionnel — peuvent aussi être affectés plus tard)
                    </label>
                    {coursDeLaSection.length === 0 ? (
                      <p className="text-xs text-ink-faint">Aucun cours dans cette section pour l&apos;instant.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {coursDeLaSection.map((co) => (
                          <label
                            key={co.id}
                            className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs text-ink-muted"
                          >
                            <input type="checkbox" name="coursIds" value={co.id} />
                            {co.nom}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <SubmitButton variant="secondary" pendingLabel="Ajout…">
                  Créer la cohorte
                </SubmitButton>
              </form>
              {cours.length === 0 && (
                <p className="mt-2 text-sm text-ochre">
                  Aucun cours enregistré : créez-en un ci-dessus pour pouvoir en affecter aux cohortes.
                </p>
              )}
            </>
          )}
      </ModalShell>
    </>
  );
}
