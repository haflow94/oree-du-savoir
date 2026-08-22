import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, hasRole } from "@/lib/roles";
import {
  estReinscrit,
  filtreParReinscription,
  filtreParSection,
  inclureDossierAnnuelActif,
  inclureInscriptionsActives,
  sectionsDInscriptions,
} from "@/lib/sections-etudiant";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { TableWrap, TableHead } from "@/components/ui/table";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { CONTROL_CLASSES } from "@/components/ui/champ";

const PEUT_CREER = [Role.ACCUEIL, Role.ADMINISTRATION, Role.BUREAU];

export default async function EtudiantsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    sectionId?: string;
    reinscription?: string;
    anneeId?: string;
    supprime?: string;
  }>;
}) {
  const session = await requireSession();
  const { q, sectionId, reinscription, anneeId, supprime } = await searchParams;
  const recherche = q?.trim() ?? "";

  const [anneeScolaires, sections] = await Promise.all([
    prisma.anneeScolaire.findMany({ orderBy: { dateDebut: "desc" } }),
    prisma.section.findMany({ orderBy: { nom: "asc" } }),
  ]);
  const anneeActive = anneeScolaires.find((a) => a.active) ?? null;
  // Année pour laquelle on regarde sections/réinscription : sélectionnable
  // (utile pour préparer/suivre la prochaine année scolaire avant de la
  // basculer en "active", sans perturber les présences de l'année en cours),
  // par défaut l'année active.
  const anneeSelectionneeId =
    (anneeId && anneeScolaires.some((a) => a.id === anneeId) ? anneeId : null) ??
    anneeActive?.id ??
    null;

  const etudiants = await prisma.etudiant.findMany({
    where: {
      ...(recherche
        ? {
            OR: [
              { nom: { contains: recherche, mode: "insensitive" } },
              { prenom: { contains: recherche, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(sectionId && anneeSelectionneeId ? filtreParSection(anneeSelectionneeId, sectionId) : {}),
      ...(reinscription === "oui" || reinscription === "non"
        ? anneeSelectionneeId
          ? filtreParReinscription(anneeSelectionneeId, reinscription === "oui")
          : {}
        : {}),
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    include: {
      _count: { select: { responsables: true } },
      // Pas d'année sélectionnée (cas anormal, aucune année scolaire en
      // base) : clause qui ne matche jamais, pour garder une forme
      // d'include statique plutôt que de bifurquer le type.
      inscriptions: anneeSelectionneeId
        ? inclureInscriptionsActives(anneeSelectionneeId)
        : { where: { id: "" }, include: { classe: { include: { cours: { include: { section: true } } } } } },
      dossiersAnnuels: anneeSelectionneeId
        ? inclureDossierAnnuelActif(anneeSelectionneeId)
        : { where: { id: "" } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-pine-strong">Étudiants</h1>
          <p className="text-sm text-ink-muted">
            Fiche unique par personne, réinscription multi-années à venir.
          </p>
        </div>
        {hasRole(session.role, PEUT_CREER) && (
          <Link href="/etudiants/nouveau" className={buttonVariants({ variant: "primary" })}>
            + Nouvel étudiant
          </Link>
        )}
      </div>

      {supprime && <Alert variant="success">Fiche supprimée.</Alert>}

      <form className="flex flex-wrap gap-2" action="/etudiants" method="GET">
        <label htmlFor="q" className="sr-only">
          Rechercher par nom ou prénom
        </label>
        <input
          id="q"
          type="search"
          name="q"
          defaultValue={recherche}
          placeholder="Rechercher par nom ou prénom…"
          className={`w-full max-w-sm ${CONTROL_CLASSES}`}
        />
        <label htmlFor="anneeId" className="sr-only">
          Année scolaire
        </label>
        <AutoSubmitSelect
          id="anneeId"
          name="anneeId"
          defaultValue={anneeSelectionneeId ?? ""}
          className={CONTROL_CLASSES}
        >
          {anneeScolaires.length === 0 && <option value="">Aucune année scolaire</option>}
          {anneeScolaires.map((a) => (
            <option key={a.id} value={a.id}>
              {a.libelle}
              {a.active ? " (active)" : ""}
            </option>
          ))}
        </AutoSubmitSelect>
        <label htmlFor="sectionId" className="sr-only">
          Section
        </label>
        <AutoSubmitSelect
          id="sectionId"
          name="sectionId"
          defaultValue={sectionId ?? ""}
          className={CONTROL_CLASSES}
        >
          <option value="">Toutes les sections</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </AutoSubmitSelect>
        <label htmlFor="reinscription" className="sr-only">
          Réinscription
        </label>
        <AutoSubmitSelect
          id="reinscription"
          name="reinscription"
          defaultValue={reinscription ?? ""}
          className={CONTROL_CLASSES}
        >
          <option value="">Réinscrits et non réinscrits</option>
          <option value="oui">Réinscrits</option>
          <option value="non">Non réinscrits</option>
        </AutoSubmitSelect>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          Rechercher
        </button>
        <a
          href={`/etudiants/export?${new URLSearchParams({
            ...(recherche ? { q: recherche } : {}),
            ...(sectionId ? { sectionId } : {}),
            ...(reinscription ? { reinscription } : {}),
            ...(anneeSelectionneeId ? { anneeId: anneeSelectionneeId } : {}),
          }).toString()}`}
          className={buttonVariants({ variant: "secondary" })}
        >
          Exporter en CSV
        </a>
      </form>
      <p className="text-xs text-ink-faint">
        Section(s) et Réinscription se lisent pour l&apos;année scolaire
        choisie ci-dessus (par défaut l&apos;année active). L&apos;export
        reprend la recherche et tous les filtres (laissez vides pour tout
        exporter).
      </p>

      <TableWrap>
        <TableHead>
          <th className="px-4 py-3">Nom</th>
          <th className="px-4 py-3">Prénom</th>
          <th className="px-4 py-3">Section(s)</th>
          <th className="px-4 py-3">Réinscription</th>
          <th className="px-4 py-3">Date de naissance</th>
          <th className="px-4 py-3">Téléphone</th>
          <th className="px-4 py-3">Email</th>
          <th className="px-4 py-3">Responsables</th>
        </TableHead>
        <tbody className="divide-y divide-border">
          {etudiants.map((e) => {
            const sectionsEtudiant = sectionsDInscriptions(e.inscriptions);
            return (
              <tr key={e.id} className="hover:bg-bg-sunken/40">
                <td className="px-4 py-3 font-medium text-ink">
                  <Link href={`/etudiants/${e.id}`} className="hover:underline">
                    {e.nom}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-muted">{e.prenom}</td>
                <td className="px-4 py-3">
                  {sectionsEtudiant.length === 0 ? (
                    <span className="text-ink-faint">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {sectionsEtudiant.map((s) => (
                        <Badge key={s.id} variant="neutral">
                          {s.nom}
                        </Badge>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {estReinscrit(e) ? (
                    <Badge variant="success">Réinscrit</Badge>
                  ) : (
                    <Badge variant="warning">Non réinscrit</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {e.dateNaissance
                    ? new Date(e.dateNaissance).toLocaleDateString("fr-FR")
                    : "—"}
                </td>
                <td className="px-4 py-3 text-ink-muted">{e.telephoneMobile ?? "—"}</td>
                <td className="px-4 py-3 text-ink-muted">{e.email ?? "—"}</td>
                <td className="px-4 py-3 text-ink-muted">{e._count.responsables}</td>
              </tr>
            );
          })}
          {etudiants.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-ink-faint">
                {recherche
                  ? "Aucun étudiant ne correspond à cette recherche."
                  : "Aucun étudiant enregistré pour l'instant."}
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
    </div>
  );
}
