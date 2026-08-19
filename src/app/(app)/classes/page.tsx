import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JOURS_ORDONNES, JOUR_LABELS } from "@/lib/planning";
import { Role, hasRole } from "@/lib/roles";
import { creerCoursAction, modifierCoursAction, supprimerCoursAction } from "./actions";
import { Card, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { TableWrap, TableHead } from "@/components/ui/table";

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
  }>;
}) {
  const session = await requireSession();
  const peutGerer = hasRole(session.role, PEUT_GERER);
  const { error, ok, sectionId, jour, salle } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const [cours, sections, sallesDistinctes, classes, anneeActive] = await Promise.all([
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
    prisma.classe.findMany({
      where: {
        ...(sectionId ? { cours: { sectionId } } : {}),
        ...(jour ? { jour: jour as (typeof JOURS_ORDONNES)[number] } : {}),
        ...(salle ? { salle } : {}),
      },
      orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
      include: {
        cours: { include: { section: true } },
        anneeScolaire: true,
        enseignants: { include: { utilisateur: true } },
      },
    }),
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-pine-strong">Classes</h1>
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

      <form className="flex flex-wrap gap-2" action="/classes" method="GET">
        <select name="sectionId" defaultValue={sectionId ?? ""} className={CONTROL_CLASSES}>
          <option value="">Toutes les sections</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
        <select name="jour" defaultValue={jour ?? ""} className={CONTROL_CLASSES}>
          <option value="">Tous les jours</option>
          {JOURS_ORDONNES.map((j) => (
            <option key={j} value={j}>
              {JOUR_LABELS[j]}
            </option>
          ))}
        </select>
        <select name="salle" defaultValue={salle ?? ""} className={CONTROL_CLASSES}>
          <option value="">Toutes les salles</option>
          {sallesDistinctes.map(
            (c) =>
              c.salle && (
                <option key={c.salle} value={c.salle}>
                  {c.salle}
                </option>
              ),
          )}
        </select>
        <Button type="submit" variant="secondary">
          Filtrer
        </Button>
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
              <td className="px-4 py-3 text-ink-muted">{c.anneeScolaire.libelle}</td>
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
