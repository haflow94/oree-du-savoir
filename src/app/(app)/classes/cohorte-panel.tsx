"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { creerCoursAction, creerCohorteAction, modifierCohorteAction, supprimerCohorteAction } from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { CONTROL_CLASSES, CONTROL_SM_CLASSES } from "@/components/ui/champ";
import { JOURS_ORDONNES, JOUR_LABELS } from "@/lib/planning";

const LABEL_SM_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";
const NIVEAUX_DATALIST_ID = "cohorte-niveaux-existants";
// Mémorise la dernière section choisie dans le formulaire de création : sans
// ça, ajouter un cours à la volée (voir bouton "+ Nouveau cours" ci-dessous)
// provoque un aller-retour serveur qui remonte ce composant et vide le
// formulaire à moitié rempli — perte de contexte que la fusion des popups
// Cours/Cohortes visait justement à éviter (voir structure-dialog.tsx).
const SECTION_STORAGE_KEY = "classes:cohorteSectionSelectionnee";

type Section = { id: string; nom: string };
type Cohorte = {
  id: string;
  section: Section;
  niveau: string | null;
  jour: (typeof JOURS_ORDONNES)[number];
  capacite: { capaciteMax: number | null; salleNom: string | null } | null;
  cours: { id: string; nom: string }[];
  _count: { classes: number };
};
type Cours = { id: string; nom: string; section: { id: string } };

// Le nom de la Section n'entre plus dans ce libellé : chaque cohorte est
// désormais affichée sous l'en-tête de sa Section (voir groupesParSection
// ci-dessous), qui porte déjà cette information.
function libelleCohorte(c: Pick<Cohorte, "niveau" | "jour">) {
  return `${c.niveau ?? "Sans niveau"} (${JOUR_LABELS[c.jour]})`;
}

function lireSectionMemorisee(): string {
  try {
    return sessionStorage.getItem(SECTION_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

// Contenu de l'onglet "Cohortes" du StructureDialog (voir classes/structure-dialog.tsx).
// Composant pur (pas de <dialog>, pas de bouton déclencheur) pour rester
// réutilisable indépendamment de la coquille modale.
export function CohortePanel({
  cohortes,
  cours,
  sections,
  joursActifs,
  peutGerer,
}: {
  cohortes: Cohorte[];
  cours: Cours[];
  sections: Section[];
  joursActifs: (typeof JOURS_ORDONNES)[number][];
  peutGerer: boolean;
}) {
  const [recherche, setRecherche] = useState("");
  const cohortesFiltrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return cohortes;
    return cohortes.filter(
      (c) =>
        c.section.nom.toLowerCase().includes(q) ||
        (c.niveau ?? "").toLowerCase().includes(q) ||
        JOUR_LABELS[c.jour].toLowerCase().includes(q),
    );
  }, [cohortes, recherche]);
  // Regroupé par Section (dans l'ordre de la liste des sections), même
  // logique que CoursPanel : évite de mélanger dans un même tas des
  // cohortes de domaines d'enseignement différents.
  const groupesParSection = useMemo(
    () =>
      sections
        .map((s) => ({ section: s, items: cohortesFiltrees.filter((c) => c.section.id === s.id) }))
        .filter((g) => g.items.length > 0),
    [sections, cohortesFiltrees],
  );

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
  // Initialisé vide (jamais depuis sessionStorage) pour que le rendu serveur
  // et la première passe client coïncident ; la valeur mémorisée n'est
  // restaurée qu'après montage (ci-dessous), pour éviter un mismatch
  // d'hydratation React.
  const [sectionSelectionnee, setSectionSelectionnee] = useState("");
  const [ajoutCoursOuvert, setAjoutCoursOuvert] = useState(false);

  useEffect(() => {
    const sauvegarde = lireSectionMemorisee();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restauration post-montage volontaire (voir commentaire ligne 98) : ne peut pas être lue dans l'initializer sans provoquer un mismatch d'hydratation.
    if (sauvegarde) setSectionSelectionnee(sauvegarde);
  }, []);
  const niveauxSuggeres = useMemo(
    () =>
      [...(niveauxParSection.get(sectionSelectionnee) ?? [])].sort((a, b) => a.localeCompare(b, "fr")),
    [sectionSelectionnee, niveauxParSection],
  );
  const coursDeLaSection = cours.filter((co) => co.section.id === sectionSelectionnee);

  function choisirSection(id: string) {
    setSectionSelectionnee(id);
    setAjoutCoursOuvert(false);
    try {
      sessionStorage.setItem(SECTION_STORAGE_KEY, id);
    } catch {
      // sessionStorage indisponible (navigation privée, quota…) : dégrade
      // simplement en formulaire non mémorisé, sans bloquer la création.
    }
  }

  return (
    <div className="mt-3">
      <p className="text-xs text-ink-faint">
        Une cohorte (section + niveau + jour, ex. un même groupe d&apos;enfants
        qui tourne entre plusieurs matières sur un même créneau) est créée une
        fois, seule, puis on lui affecte un ou plusieurs cours — réutilisée
        chaque année scolaire pour créer une ou plusieurs classes. Sa capacité
        (liste d&apos;attente) suit celle de la salle occupée par ses classes
        cette année : à définir depuis Administration → Salles.
      </p>

      {cohortes.length > 5 && (
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher une cohorte…"
          className={`mt-3 w-full max-w-xs ${CONTROL_SM_CLASSES}`}
        />
      )}

      {cohortes.length === 0 && (
        <p className="mt-3 text-sm text-ink-faint">Aucune cohorte enregistrée.</p>
      )}
      {cohortes.length > 0 && cohortesFiltrees.length === 0 && (
        <p className="mt-3 text-sm text-ink-faint">Aucune cohorte ne correspond à « {recherche} ».</p>
      )}
      <div className="mt-3 space-y-3">
        {groupesParSection.map(({ section, items }) => (
          <div key={section.id}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {section.nom}
            </p>
            <div className="flex flex-wrap gap-2">
              {items.map((c) =>
                peutGerer ? (
                  <details key={c.id} className="rounded-lg border border-border px-3 py-1.5">
                    <summary className="cursor-pointer text-sm text-ink-muted">
                      {libelleCohorte(c)}
                      {c.capacite?.capaciteMax != null && (
                        <span className="ml-1 text-xs text-ink-faint">
                          · max {c.capacite.capaciteMax} (salle {c.capacite.salleNom})
                        </span>
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
                      <SubmitButton variant="secondary" size="sm" pendingLabel="Enregistrement…">
                        Enregistrer
                      </SubmitButton>
                    </form>
                    <p className="mt-1 text-[11px] text-ink-faint">
                      {c.capacite?.capaciteMax != null
                        ? `Capacité : ${c.capacite.capaciteMax} places (salle ${c.capacite.salleNom}, année active).`
                        : "Capacité illimitée pour l'instant : assignez une salle aux classes de ce bloc pour l'année active afin d'en fixer une (voir Administration → Salles)."}
                    </p>
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
                    {c.capacite?.capaciteMax != null && ` · max ${c.capacite.capaciteMax}`}
                  </Badge>
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      {peutGerer && (
        <>
          {sectionSelectionnee && ajoutCoursOuvert && (
            <form
              action={creerCoursAction}
              className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-2"
            >
              <input type="hidden" name="sectionId" value={sectionSelectionnee} />
              <input
                type="text"
                name="nom"
                required
                placeholder="Nom du nouveau cours"
                className={`w-full max-w-xs ${CONTROL_SM_CLASSES}`}
              />
              <SubmitButton variant="secondary" size="sm" pendingLabel="Ajout…">
                Ajouter
              </SubmitButton>
              <button
                type="button"
                onClick={() => setAjoutCoursOuvert(false)}
                className="text-xs text-ink-faint hover:underline"
              >
                Annuler
              </button>
            </form>
          )}
          <form action={creerCohorteAction} className="mt-4 space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className={LABEL_SM_CLASSES}>Section</label>
                <select
                  name="sectionId"
                  required
                  value={sectionSelectionnee}
                  onChange={(e) => choisirSection(e.target.value)}
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
            </div>
            {sectionSelectionnee && (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className={LABEL_SM_CLASSES}>
                    Cours à affecter (optionnel — peuvent aussi être affectés plus tard)
                  </label>
                  {!ajoutCoursOuvert && (
                    <button
                      type="button"
                      onClick={() => setAjoutCoursOuvert(true)}
                      className="text-xs font-medium text-pine hover:underline"
                    >
                      + Nouveau cours
                    </button>
                  )}
                </div>
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
    </div>
  );
}
