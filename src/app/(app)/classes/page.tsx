import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JOURS_ORDONNES, JOUR_LABELS } from "@/lib/planning";
import { Role, hasRole } from "@/lib/roles";
import {
  creerCoursAction,
  modifierCoursAction,
  supprimerCoursAction,
  dupliquerClassesAction,
} from "./actions";
import { Card, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { TableWrap, TableHead } from "@/components/ui/table";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";

const PEUT_GERER = [Role.ADMINISTRATION, Role.BUREAU];
const CONTROL_CLASSES =
  "rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";
const CONTROL_SM_CLASSES =
  "rounded-md border border-border-strong bg-bg-elevated px-2 py-1.5 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";
const LABEL_SM_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

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
  }>;
}) {
  const session = await requireSession();
  const peutGerer = hasRole(session.role, PEUT_GERER);
  const { error, ok, sectionId, jour, salle, anneeScolaireId } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

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
    },
    orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
    include: {
      cours: { include: { section: true } },
      anneeScolaire: true,
      enseignants: { include: { utilisateur: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-pine-strong">Classes</h1>
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
        {peutGerer && (
          <Link href="/classes/nouveau" className={buttonVariants({ variant: "primary" })}>
            + Nouvelle classe
          </Link>
        )}
      </div>

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      <Card>
        <CardTitle>Cours</CardTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          {cours.length === 0 && (
            <p className="text-sm text-ink-faint">Aucun cours enregistré.</p>
          )}
          {cours.map((c) =>
            peutGerer ? (
              <details key={c.id} className="rounded-lg border border-border px-3 py-1.5">
                <summary className="cursor-pointer text-sm text-ink-muted">
                  {c.nom}
                  <span className="ml-1 text-xs text-ink-faint">({c.section.nom})</span>
                </summary>
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
                  <Button type="submit" variant="secondary" size="sm">
                    Enregistrer
                  </Button>
                </form>
                <form action={supprimerCoursAction} className="mt-2">
                  <input type="hidden" name="coursId" value={c.id} />
                  <button
                    type="submit"
                    disabled={c._count.classes > 0}
                    title={
                      c._count.classes > 0
                        ? "Des classes sont rattachées à ce cours : impossible de le supprimer."
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
                {c.nom} ({c.section.nom})
              </Badge>
            ),
          )}
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
              <Button type="submit" variant="secondary">
                Ajouter
              </Button>
            </form>
            {sections.length === 0 && (
              <p className="mt-2 text-sm text-ochre">
                Aucune section enregistrée : exécutez le seed (
                <code>npm run db:seed</code>) avant de créer un cours.
              </p>
            )}
          </>
        )}
      </Card>

      {peutGerer && anneeActive && annees.some((a) => a.id !== anneeActive.id) && (
        <Card>
          <CardTitle>Dupliquer des classes vers l&apos;année active</CardTitle>
          <p className="mt-1 text-xs text-ink-faint">
            Copie cours, niveau, créneau, salle, capacité et enseignants d&apos;une
            année vers {anneeActive.libelle} en un clic. Les classes déjà
            présentes sur {anneeActive.libelle} (même cours, niveau, jour et
            heure) ne sont pas dupliquées deux fois.
          </p>
          <form action={dupliquerClassesAction} className="mt-3 flex flex-wrap items-end gap-2">
            <select name="anneeSourceId" defaultValue="" className={CONTROL_CLASSES}>
              <option value="" disabled>
                Depuis quelle année ?
              </option>
              {annees
                .filter((a) => a.id !== anneeActive.id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.libelle}
                  </option>
                ))}
            </select>
            <Button type="submit" variant="secondary">
              Dupliquer vers {anneeActive.libelle}
            </Button>
          </form>
        </Card>
      )}

      <form className="flex flex-wrap gap-2" action="/classes" method="GET">
        <AutoSubmitSelect
          name="anneeScolaireId"
          defaultValue={anneeFiltre}
          className={CONTROL_CLASSES}
        >
          <option value="">Toutes les années</option>
          {annees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.libelle}
              {a.active ? " (active)" : ""}
            </option>
          ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="sectionId" defaultValue={sectionId ?? ""} className={CONTROL_CLASSES}>
          <option value="">Toutes les sections</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="jour" defaultValue={jour ?? ""} className={CONTROL_CLASSES}>
          <option value="">Tous les jours</option>
          {JOURS_ORDONNES.map((j) => (
            <option key={j} value={j}>
              {JOUR_LABELS[j]}
            </option>
          ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="salle" defaultValue={salle ?? ""} className={CONTROL_CLASSES}>
          <option value="">Toutes les salles</option>
          {sallesDistinctes.map(
            (c) =>
              c.salle && (
                <option key={c.salle} value={c.salle}>
                  {c.salle}
                </option>
              ),
          )}
        </AutoSubmitSelect>
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
              </td>
            </tr>
          ))}
          {classes.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-ink-faint">
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
