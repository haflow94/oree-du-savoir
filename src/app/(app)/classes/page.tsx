import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { JOURS_ORDONNES, JOUR_LABELS } from "@/lib/planning";
import { requireModule, peutAccederModule, Module } from "@/lib/permissions";
import { supprimerClasseAction } from "./[id]/actions";
import { CoursDialog } from "./cours-dialog";
import { DupliquerClassesDialog } from "./dupliquer-classes-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { TableWrap, TableHead } from "@/components/ui/table";
import { AutoSubmitSelect, AutoSubmitInput } from "@/components/ui/auto-submit";
import { CONTROL_SM_CLASSES, TOOLBAR_CLASSES } from "@/components/ui/champ";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconChip } from "@/components/ui/icon-chip";

const ERREURS_COURS = ["CHAMPS_INVALIDES", "NOM_DEJA_UTILISE", "INTROUVABLE", "COURS_UTILISE"];
const ERREURS_DUPLICATION = ["ANNEE_SOURCE_MANQUANTE", "AUCUNE_ANNEE_ACTIVE", "MEME_ANNEE"];

const MESSAGES: Record<string, string> = {
  CHAMPS_INVALIDES: "Nom et section sont obligatoires.",
  NOM_DEJA_UTILISE: "Un cours porte déjà ce nom.",
  INTROUVABLE: "Ce cours n'existe plus.",
  COURS_UTILISE:
    "Impossible de supprimer : des classes sont rattachées à ce cours.",
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
    salle?: string;
    anneeScolaireId?: string;
    q?: string;
    archives?: string;
  }>;
}) {
  const session = await requireModule(Module.CLASSES, "LECTURE");
  const peutGerer = await peutAccederModule(session.role, Module.CLASSES, "ECRITURE");
  const { error, ok, sectionId, jour, salle, anneeScolaireId, q, archives } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;
  const recherche = q?.trim() ?? "";
  const voirArchives = archives === "1";

  const [cours, sections, sallesDistinctes, annees, anneeActive] = await Promise.all([
    prisma.cours.findMany({
      orderBy: { nom: "asc" },
      include: { section: true, _count: { select: { classes: true } } },
    }),
    prisma.section.findMany({ orderBy: { nom: "asc" } }),
    prisma.classe.findMany({
      where: { salle: { not: null } },
      distinct: ["salle"],
      select: { salle: true },
      orderBy: { salle: "asc" },
    }),
    prisma.anneeScolaire.findMany({ orderBy: { libelle: "desc" } }),
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
  ]);

  // Sans filtre explicite dans l'URL (première visite), on reprend l'année
  // scolaire active plutôt que de tout mélanger : "" (venant du filtre
  // "Toutes les années") reste un choix explicite distinct de l'absence de
  // paramètre.
  const anneeFiltre = anneeScolaireId !== undefined ? anneeScolaireId : anneeActive?.id ?? "";

  const classes = await prisma.classe.findMany({
    where: {
      ...(sectionId ? { cours: { sectionId } } : {}),
      ...(jour ? { jour: jour as (typeof JOURS_ORDONNES)[number] } : {}),
      ...(salle ? { salle } : {}),
      ...(anneeFiltre ? { anneeScolaireId: anneeFiltre } : {}),
      // Une année précisément choisie reste visible quel que soit son statut
      // (choix explicite) : le filtre "voir les archives" ne joue qu'en mode
      // "Toutes années".
      ...(!voirArchives && !anneeFiltre ? { anneeScolaire: { archivee: false } } : {}),
      ...(recherche
        ? {
            OR: [
              { cours: { nom: { contains: recherche, mode: "insensitive" } } },
              { niveau: { contains: recherche, mode: "insensitive" } },
              { salle: { contains: recherche, mode: "insensitive" } },
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
    orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
    include: {
      cours: { include: { section: true } },
      anneeScolaire: true,
      enseignants: { include: { utilisateur: true } },
      _count: { select: { seances: true, inscriptions: true } },
    },
  });

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
              Cours, classes, créneaux, enseignants, capacité.
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
        <AutoSubmitSelect name="salle" defaultValue={salle ?? ""} className={CONTROL_SM_CLASSES}>
          <option value="">Toutes salles</option>
          {sallesDistinctes.map(
            (c) =>
              c.salle && (
                <option key={c.salle} value={c.salle}>
                  {c.salle}
                </option>
              ),
          )}
        </AutoSubmitSelect>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <AutoSubmitInput type="checkbox" name="archives" value="1" defaultChecked={voirArchives} />
          Voir les archives
        </label>
        <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Rechercher
        </button>
      </form>

      <TableWrap>
        <TableHead>
          <th className="px-4 py-3">Cours</th>
          <th className="px-4 py-3">Niveau</th>
          <th className="px-4 py-3">Créneau</th>
          <th className="px-4 py-3">Salle</th>
          <th className="px-4 py-3">Capacité</th>
          <th className="px-4 py-3">Enseignant(s)</th>
          <th className="px-4 py-3">Année</th>
          {peutGerer && <th className="px-4 py-3" />}
        </TableHead>
        <tbody className="divide-y divide-border">
          {classes.map((c) => (
            <tr key={c.id} className="hover:bg-bg-sunken/40">
              <td className="px-4 py-3 font-medium text-ink">
                <Link href={`/classes/${c.id}`} className="hover:underline">
                  {c.cours.nom}
                </Link>
                <div className="text-xs font-normal text-ink-faint">{c.cours.section.nom}</div>
              </td>
              <td className="px-4 py-3 text-ink-muted">
                {c.niveau ?? "—"}
                {c.semestre && <span className="ml-1 text-xs text-ink-faint">(S{c.semestre})</span>}
              </td>
              <td className="px-4 py-3 text-ink-muted">
                {JOUR_LABELS[c.jour]} {c.heureDebut}–{c.heureFin}
              </td>
              <td className="px-4 py-3 text-ink-muted">{c.salle ?? "—"}</td>
              <td className="px-4 py-3 text-ink-muted">{c.capacite ?? "—"}</td>
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
          {classes.length === 0 && (
            <tr>
              <td colSpan={peutGerer ? 8 : 7} className="px-4 py-8 text-center text-ink-faint">
                Aucune classe enregistrée pour l&apos;instant.
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>

      {!anneeActive && (
        <Alert variant="warning">
          Aucune année scolaire active : la création de classe utilisera la
          plus récente disponible.
        </Alert>
      )}
    </div>
  );
}
