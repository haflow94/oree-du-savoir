import { Fragment } from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { JOURS_ORDONNES, JOUR_LABELS } from "@/lib/planning";
import { requireModule, peutAccederModule, Module } from "@/lib/permissions";
import { supprimerClasseAction } from "./[id]/actions";
import { CoursDialog } from "./cours-dialog";
import { CohorteDialog } from "./cohorte-dialog";
import { DupliquerClassesDialog } from "./dupliquer-classes-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { TableWrap, TableHead } from "@/components/ui/table";
import { AutoSubmitSelect, AutoSubmitInput } from "@/components/ui/auto-submit";
import { CONTROL_SM_CLASSES, TOOLBAR_CLASSES } from "@/components/ui/champ";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconChip, type Accent } from "@/components/ui/icon-chip";

// Cycle de couleurs pour distinguer visuellement chaque section dans la
// liste groupée ci-dessous — purement décoratif, pas une donnée métier.
const ACCENTS_SECTION: Accent[] = ["pine", "sage", "ochre", "sky", "rust"];

const ERREURS_COURS = ["CHAMPS_INVALIDES", "NOM_DEJA_UTILISE", "INTROUVABLE", "COURS_UTILISE"];
const ERREURS_COHORTE = [
  "COHORTE_CHAMPS_MANQUANTS",
  "COHORTE_DEJA_EXISTANTE",
  "COHORTE_INTROUVABLE",
  "COHORTE_UTILISEE",
  "COHORTE_CAPACITE_INVALIDE",
  "COHORTE_COURS_UTILISE",
  "COURS_HORS_SECTION",
  "COHORTE_SECTION_VERROUILLEE",
];
const ERREURS_DUPLICATION = ["ANNEE_SOURCE_MANQUANTE", "AUCUNE_ANNEE_ACTIVE", "MEME_ANNEE"];

// Niveau reste un champ texte libre (voir prisma/schema.prisma#Cohorte,
// décision Phase 1 : pas de référentiel séparé) : un tri alphabétique classe
// "Deuxième" avant "Première" (D < P), ce qui n'est pas l'ordre pédagogique
// attendu. On reconnaît les tournures courantes (ordinaux en chiffres ou en
// toutes lettres, niveaux de compétence) pour trier correctement quand elles
// sont détectées, sans jamais imposer de vocabulaire — un niveau non reconnu
// retombe simplement en fin de liste, trié alphabétiquement entre eux.
const ORDINAUX_FR: Record<string, number> = {
  premier: 1,
  première: 1,
  deuxième: 2,
  second: 2,
  seconde: 2,
  troisième: 3,
  quatrième: 4,
  cinquième: 5,
  sixième: 6,
};
const NIVEAUX_COMPETENCE: Record<string, number> = {
  débutant: 1,
  intermédiaire: 2,
  avancé: 3,
  confirmé: 4,
};

function ordreNiveau(niveauBrut: string | null): number {
  if (!niveauBrut) return Number.POSITIVE_INFINITY;
  const niveau = niveauBrut.trim().toLowerCase();
  const chiffre = niveau.match(/^(\d+)/); // "1ère année", "2ème année"…
  if (chiffre) return Number(chiffre[1]);
  const premierMot = niveau.split(/\s+/)[0];
  if (premierMot in ORDINAUX_FR) return ORDINAUX_FR[premierMot];
  if (niveau in NIVEAUX_COMPETENCE) return NIVEAUX_COMPETENCE[niveau];
  return Number.POSITIVE_INFINITY;
}

const MESSAGES: Record<string, string> = {
  CHAMPS_INVALIDES: "Nom et section sont obligatoires.",
  NOM_DEJA_UTILISE: "Un cours porte déjà ce nom.",
  INTROUVABLE: "Ce cours n'existe plus.",
  COURS_UTILISE:
    "Impossible de supprimer : des cohortes ou des classes utilisent ce cours.",
  COHORTE_CHAMPS_MANQUANTS: "La section et le jour sont obligatoires.",
  COHORTE_DEJA_EXISTANTE: "Une cohorte identique (même section, niveau et jour) existe déjà.",
  COHORTE_INTROUVABLE: "Cette cohorte n'existe plus.",
  COHORTE_UTILISEE:
    "Impossible de supprimer : des classes ou des affectations sont rattachées à cette cohorte.",
  COHORTE_CAPACITE_INVALIDE: "La capacité doit être un nombre entier positif.",
  COHORTE_COURS_UTILISE:
    "Un cours retiré est encore instancié par une classe de cette cohorte : supprimez d'abord la classe, ou gardez ce cours.",
  COURS_HORS_SECTION: "Ce cours n'appartient pas à la section de la cohorte.",
  COHORTE_SECTION_VERROUILLEE:
    "Impossible de changer la section : des cours sont déjà affectés à cette cohorte.",
  ANNEE_SOURCE_MANQUANTE: "Choisissez une année source à dupliquer.",
  AUCUNE_ANNEE_ACTIVE: "Aucune année scolaire active : impossible de dupliquer.",
  MEME_ANNEE: "Choisissez une année différente de l'année active.",
};

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    ok?: string;
    sectionId?: string;
    jour?: string;
    salleId?: string;
    anneeScolaireId?: string;
    q?: string;
    archives?: string;
  }>;
}) {
  const session = await requireModule(Module.CLASSES, "LECTURE");
  const peutGerer = await peutAccederModule(session.role, Module.CLASSES, "ECRITURE");
  const { error, ok, sectionId, jour, salleId, anneeScolaireId, q, archives } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;
  const recherche = q?.trim() ?? "";
  const voirArchives = archives === "1";

  const [cours, cohortesBrutes, sections, salles, annees, anneeActive, organisation] = await Promise.all([
    prisma.cours.findMany({
      orderBy: { nom: "asc" },
      include: {
        section: { select: { id: true, nom: true } },
        _count: { select: { cohortesLiees: true, classes: true } },
      },
    }),
    prisma.cohorte.findMany({
      orderBy: [{ section: { nom: "asc" } }, { niveau: "asc" }, { jour: "asc" }],
      include: {
        section: { select: { id: true, nom: true } },
        coursLies: {
          include: { cours: { select: { id: true, nom: true } } },
          orderBy: { ordre: "asc" },
        },
        _count: { select: { classes: true } },
      },
    }),
    prisma.section.findMany({ orderBy: { nom: "asc" }, select: { id: true, nom: true } }),
    prisma.salle.findMany({ orderBy: { nom: "asc" }, select: { id: true, nom: true } }),
    prisma.anneeScolaire.findMany({ orderBy: { libelle: "desc" } }),
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
    prisma.organisation.findFirst({ select: { joursActifs: true } }),
  ]);
  const joursActifs = organisation?.joursActifs ?? JOURS_ORDONNES;
  const cohortes = cohortesBrutes.map((c) => ({
    id: c.id,
    section: c.section,
    niveau: c.niveau,
    jour: c.jour,
    capaciteMax: c.capaciteMax,
    cours: c.coursLies.map((cl) => cl.cours),
    _count: c._count,
  }));

  // Sans filtre explicite dans l'URL (première visite), on reprend l'année
  // scolaire active plutôt que de tout mélanger : "" (venant du filtre
  // "Toutes les années") reste un choix explicite distinct de l'absence de
  // paramètre.
  const anneeFiltre = anneeScolaireId !== undefined ? anneeScolaireId : anneeActive?.id ?? "";

  const classes = await prisma.classe.findMany({
    where: {
      ...(sectionId ? { cours: { sectionId } } : {}),
      ...(jour ? { cohorte: { jour: jour as (typeof JOURS_ORDONNES)[number] } } : {}),
      ...(salleId ? { salleId } : {}),
      ...(anneeFiltre ? { anneeScolaireId: anneeFiltre } : {}),
      // Une année précisément choisie reste visible quel que soit son statut
      // (choix explicite) : le filtre "voir les archives" ne joue qu'en mode
      // "Toutes années".
      ...(!voirArchives && !anneeFiltre ? { anneeScolaire: { archivee: false } } : {}),
      ...(recherche
        ? {
            OR: [
              { cours: { nom: { contains: recherche, mode: "insensitive" } } },
              { cohorte: { niveau: { contains: recherche, mode: "insensitive" } } },
              { salle: { nom: { contains: recherche, mode: "insensitive" } } },
              {
                enseignants: {
                  some: {
                    utilisateur: {
                      OR: [
                        { prenom: { contains: recherche, mode: "insensitive" } },
                        { nom: { contains: recherche, mode: "insensitive" } },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ cohorte: { jour: "asc" } }, { heureDebut: "asc" }],
    include: {
      cohorte: true,
      cours: { include: { section: true } },
      anneeScolaire: true,
      salle: true,
      enseignants: { include: { utilisateur: true } },
      _count: { select: { seances: true, inscriptions: true } },
    },
  });

  // Regroupement par section (affichage) : une section = un domaine
  // d'enseignement distinct pour l'association, donc la lecture la plus
  // naturelle de la liste des classes est par section plutôt qu'en vrac.
  // On ne montre que les sections qui ont au moins une classe après filtres.
  const groupesParSection = sections
    .map((s, index) => ({
      section: s,
      accent: ACCENTS_SECTION[index % ACCENTS_SECTION.length],
      classes: classes.filter((c) => c.cours.section.id === s.id),
    }))
    .filter((g) => g.classes.length > 0);

  // Sous-regroupement par Cohorte (affichage) : une section peut réunir
  // plusieurs Cohortes (ex. "Études Islamiques" a une Cohorte par
  // niveau+jour, chacune avec plusieurs Cours affectés) — les Classes en
  // vrac, triées seulement par jour/heure, rendaient impossible de voir
  // d'un coup d'œil quelles Classes appartiennent au même bloc. Trié par
  // niveau puis par jour (ordre du calendrier, pas alphabétique).
  function grouperParCohorte(classesSection: typeof classes) {
    const parCohorteId = new Map<string, (typeof classes)[number][]>();
    for (const c of classesSection) {
      const liste = parCohorteId.get(c.cohorteId) ?? [];
      liste.push(c);
      parCohorteId.set(c.cohorteId, liste);
    }
    return [...parCohorteId.values()]
      .map((classesCohorte) => ({ cohorte: classesCohorte[0].cohorte, classes: classesCohorte }))
      .sort((a, b) => {
        const ordreA = ordreNiveau(a.cohorte.niveau);
        const ordreB = ordreNiveau(b.cohorte.niveau);
        if (ordreA !== ordreB) return ordreA - ordreB;
        const niveauA = a.cohorte.niveau ?? "";
        const niveauB = b.cohorte.niveau ?? "";
        if (niveauA !== niveauB) return niveauA.localeCompare(niveauB, "fr");
        return JOURS_ORDONNES.indexOf(a.cohorte.jour) - JOURS_ORDONNES.indexOf(b.cohorte.jour);
      });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconChip icon={GraduationCap} accent="sage" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-semibold text-pine-strong">Classes</h1>
              {anneeActive && (
                <Badge variant={anneeFiltre === anneeActive.id || !anneeFiltre ? "success" : "neutral"}>
                  Année active : {anneeActive.libelle}
                </Badge>
              )}
            </div>
            <p className="text-sm text-ink-muted">
              Cours, classes, créneaux, enseignants.
            </p>
          </div>
        </div>
        {peutGerer && (
          <Link href="/classes/nouveau" className={buttonVariants({ variant: "primary" })}>
            + Nouvelle classe
          </Link>
        )}
      </div>

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <CoursDialog
          cours={cours}
          sections={sections}
          peutGerer={peutGerer}
          ouvrirAuChargement={!!error && ERREURS_COURS.includes(error)}
        />
        <CohorteDialog
          cohortes={cohortes}
          cours={cours}
          sections={sections}
          joursActifs={joursActifs}
          peutGerer={peutGerer}
          ouvrirAuChargement={!!error && ERREURS_COHORTE.includes(error)}
        />
        {peutGerer && anneeActive && annees.some((a) => a.id !== anneeActive.id) && (
          <DupliquerClassesDialog
            annees={annees}
            anneeActive={anneeActive}
            ouvrirAuChargement={!!error && ERREURS_DUPLICATION.includes(error)}
          />
        )}
      </div>

      <form className={TOOLBAR_CLASSES} action="/classes" method="GET">
        <div>
          <label htmlFor="q" className="sr-only">
            Rechercher par cours, niveau, salle ou enseignant
          </label>
          <input
            id="q"
            type="search"
            name="q"
            defaultValue={recherche}
            placeholder="Cours, niveau, salle, enseignant…"
            className={`w-56 ${CONTROL_SM_CLASSES}`}
          />
        </div>
        <AutoSubmitSelect
          name="anneeScolaireId"
          defaultValue={anneeFiltre}
          className={CONTROL_SM_CLASSES}
        >
          <option value="">Toutes années</option>
          {annees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.libelle}
              {a.active ? " (active)" : ""}
              {a.archivee ? " (archivée)" : ""}
            </option>
          ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="sectionId" defaultValue={sectionId ?? ""} className={CONTROL_SM_CLASSES}>
          <option value="">Toutes sections</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="jour" defaultValue={jour ?? ""} className={CONTROL_SM_CLASSES}>
          <option value="">Tous les jours</option>
          {JOURS_ORDONNES.map((j) => (
            <option key={j} value={j}>
              {JOUR_LABELS[j]}
            </option>
          ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="salleId" defaultValue={salleId ?? ""} className={CONTROL_SM_CLASSES}>
          <option value="">Toutes salles</option>
          {salles.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </AutoSubmitSelect>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <AutoSubmitInput type="checkbox" name="archives" value="1" defaultChecked={voirArchives} />
          Voir les archives
        </label>
        <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Rechercher
        </button>
      </form>

      {groupesParSection.length === 0 && (
        <div className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-ink-faint">
          Aucune classe enregistrée pour l&apos;instant.
        </div>
      )}

      <div className="space-y-4">
        {groupesParSection.map(({ section, accent, classes: classesSection }) => (
          <details key={section.id} open className="group rounded-xl border border-border bg-surface">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <IconChip icon={GraduationCap} accent={accent} />
              <span className="font-display text-lg font-semibold text-pine-strong">{section.nom}</span>
              <Badge variant="neutral">{classesSection.length}</Badge>
              <span className="ml-auto text-ink-faint transition-transform group-open:rotate-180">▾</span>
            </summary>
            <TableWrap className="rounded-t-none border-x-0 border-b-0">
              <TableHead>
                <th className="px-4 py-3">Cours</th>
                <th className="px-4 py-3">Créneau</th>
                <th className="px-4 py-3">Salle</th>
                <th className="px-4 py-3">Enseignant(s)</th>
                <th className="px-4 py-3">Année</th>
                {peutGerer && <th className="px-4 py-3" />}
              </TableHead>
              <tbody className="divide-y divide-border">
                {grouperParCohorte(classesSection).map(({ cohorte, classes: classesCohorte }) => (
                  <Fragment key={cohorte.id}>
                    <tr className="bg-bg-sunken/60">
                      <td
                        colSpan={peutGerer ? 6 : 5}
                        className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-faint"
                      >
                        {cohorte.niveau ?? "Sans niveau"} · {JOUR_LABELS[cohorte.jour]}
                        <span className="ml-2 normal-case font-normal text-ink-faint">
                          ({classesCohorte.length})
                        </span>
                      </td>
                    </tr>
                    {classesCohorte.map((c) => (
                      <tr key={c.id} className="hover:bg-bg-sunken/40">
                        <td className="px-4 py-3 font-medium text-ink">
                          <Link href={`/classes/${c.id}`} className="hover:underline">
                            {c.cours.nom}
                          </Link>
                          {c.semestre && (
                            <span className="ml-1 text-xs font-normal text-ink-faint">(S{c.semestre})</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-ink-muted">
                          {c.heureDebut}–{c.heureFin}
                        </td>
                        <td className="px-4 py-3 text-ink-muted">{c.salle?.nom ?? "—"}</td>
                        <td className="px-4 py-3 text-ink-muted">
                          {c.enseignants.length > 0
                            ? c.enseignants
                                .map((e) => `${e.utilisateur.prenom} ${e.utilisateur.nom}`)
                                .join(", ")
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={c.anneeScolaireId === anneeActive?.id ? "success" : "neutral"}>
                            {c.anneeScolaire.libelle}
                          </Badge>
                          {c.anneeScolaire.archivee && (
                            <span className="ml-1">
                              <Badge variant="neutral">Archivée</Badge>
                            </span>
                          )}
                        </td>
                        {peutGerer && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-3">
                              <Link
                                href={`/classes/nouveau?depuis=${c.id}`}
                                className="text-xs font-medium text-pine hover:underline"
                              >
                                Dupliquer
                              </Link>
                              <form id={`supprimer-classe-${c.id}`} action={supprimerClasseAction}>
                                <input type="hidden" name="classeId" value={c.id} />
                              </form>
                              <ConfirmDialog
                                formId={`supprimer-classe-${c.id}`}
                                triggerLabel="Supprimer"
                                title="Supprimer cette classe ?"
                                description="Cette action supprime définitivement la classe et ne peut pas être annulée."
                                confirmLabel="Supprimer définitivement"
                                disabled={c._count.seances > 0 || c._count.inscriptions > 0}
                                disabledTitle="Des séances ou des inscriptions existent déjà : impossible de supprimer cette classe."
                              />
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </TableWrap>
          </details>
        ))}
      </div>

      {!anneeActive && (
        <Alert variant="warning">
          Aucune année scolaire active : la création de classe utilisera la
          plus récente disponible.
        </Alert>
      )}
    </div>
  );
}
