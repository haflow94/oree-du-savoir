import Link from "next/link";
import { Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireModule, peutAccederModule, Module } from "@/lib/permissions";
import {
  compterHistoriqueAutreAnnee,
  estNouveauParCompteur,
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
import { TabLinks } from "@/components/ui/tabs";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { CONTROL_SM_CLASSES, TOOLBAR_CLASSES } from "@/components/ui/champ";
import { IconChip } from "@/components/ui/icon-chip";
import { statutCotisation, STATUT_COTISATION_VARIANTS } from "@/lib/paiements";
import { dossierDocumentaireComplet } from "@/lib/documents";

type Population = "adultes" | "jeunes";

export default async function EtudiantsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    sectionId?: string;
    reinscription?: string;
    anneeId?: string;
    supprime?: string;
    population?: string;
    statut?: string;
  }>;
}) {
  const session = await requireModule(Module.ETUDIANTS, "LECTURE");
  const peutCreer = await peutAccederModule(session.role, Module.ETUDIANTS, "ECRITURE");
  const { q, sectionId, reinscription, anneeId, supprime, population, statut } = await searchParams;
  const recherche = q?.trim() ?? "";
  const populationSelectionnee: Population = population === "jeunes" ? "jeunes" : "adultes";
  // Une préinscription (Etudiant.statutInscription = PREINSCRIT, voir
  // preinscription/actions.ts) n'est pas encore un dossier confirmé par le
  // staff : elle reste hors de cette liste générale par défaut (déjà
  // visible sur /inscriptions, dédiée à leur contrôle) et n'y apparaît que
  // si ce filtre le demande explicitement.
  const statutFiltre = statut === "preinscrit" || statut === "tous" ? statut : "valide";

  const [anneeScolaires, sections, nbDoublonsPotentiels] = await Promise.all([
    prisma.anneeScolaire.findMany({ orderBy: { dateDebut: "desc" } }),
    prisma.section.findMany({ orderBy: { nom: "asc" } }),
    prisma.etudiant.count({ where: { doublonPotentielId: { not: null } } }),
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

  // Onglets Adultes/Jeunes : "Jeunes" est une Section comme les autres
  // (référentiel Administration → Sections), pas un champ d'âge dédié — la
  // majorité des étudiants (adultes) n'y est pas inscrite. Absente du
  // référentiel (renommée/supprimée) : pas d'onglets, dégradation
  // silencieuse plutôt qu'un filtre qui ne matcherait jamais rien.
  const sectionJeunes = sections.find((s) => s.nom === "Jeunes") ?? null;

  // Chaque filtre dans son propre élément de tableau plutôt qu'un spread
  // d'objets : `filtreParSection` (section + onglet Jeunes) et
  // `filtreParReinscription` peuvent chacun produire une clé `inscriptions`
  // ou `dossiersAnnuels` — un spread les écraserait silencieusement au lieu
  // de les combiner.
  const conditions: Prisma.EtudiantWhereInput[] = [];
  if (recherche) {
    conditions.push({
      OR: [
        { nom: { contains: recherche, mode: "insensitive" } },
        { prenom: { contains: recherche, mode: "insensitive" } },
      ],
    });
  }
  if (sectionId && anneeSelectionneeId) {
    conditions.push(filtreParSection(anneeSelectionneeId, sectionId));
  }
  if (sectionJeunes && anneeSelectionneeId) {
    const filtreJeunes = filtreParSection(anneeSelectionneeId, sectionJeunes.id);
    conditions.push(populationSelectionnee === "jeunes" ? filtreJeunes : { NOT: filtreJeunes });
  }
  if ((reinscription === "oui" || reinscription === "non") && anneeSelectionneeId) {
    conditions.push(filtreParReinscription(anneeSelectionneeId, reinscription === "oui"));
  }
  if (statutFiltre !== "tous") {
    conditions.push({
      statutInscription: statutFiltre === "preinscrit" ? "PREINSCRIT" : "VALIDE",
    });
  }

  const etudiants = await prisma.etudiant.findMany({
    where: conditions.length > 0 ? { AND: conditions } : {},
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    include: {
      _count: {
        select: anneeSelectionneeId
          ? compterHistoriqueAutreAnnee(anneeSelectionneeId)
          : { inscriptions: true, dossiersAnnuels: true },
      },
      // Pas d'année sélectionnée (cas anormal, aucune année scolaire en
      // base) : clause qui ne matche jamais, pour garder une forme
      // d'include statique plutôt que de bifurquer le type.
      inscriptions: anneeSelectionneeId
        ? inclureInscriptionsActives(anneeSelectionneeId)
        : {
            where: { id: "" },
            include: { classe: { include: { cours: { include: { section: true } } } } },
          },
      dossiersAnnuels: anneeSelectionneeId
        ? inclureDossierAnnuelActif(anneeSelectionneeId)
        : { where: { id: "" }, include: { echeances: { include: { paiements: true } } } },
      // chequeId: null exclut la pièce d'identité d'un titulaire de chèque
      // tiers (voir Document.chequeId), qui n'appartient pas au dossier de
      // l'étudiant lui-même.
      documents: { where: { chequeId: null }, select: { type: true, dateExpiration: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconChip icon={Users} accent="sage" />
          <div>
            <h1 className="font-display text-3xl font-semibold text-pine-strong">Étudiants</h1>
            <p className="text-sm text-ink-muted">
              Fiche unique par personne, réinscription multi-années à venir.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {nbDoublonsPotentiels > 0 && (
            <Link href="/etudiants/doublons" className={buttonVariants({ variant: "secondary" })}>
              {nbDoublonsPotentiels} doublon{nbDoublonsPotentiels > 1 ? "s" : ""} potentiel
              {nbDoublonsPotentiels > 1 ? "s" : ""}
            </Link>
          )}
          {peutCreer && (
            <Link href="/etudiants/nouveau" className={buttonVariants({ variant: "primary" })}>
              + Nouvel étudiant
            </Link>
          )}
        </div>
      </div>

      {supprime && <Alert variant="success">Fiche supprimée.</Alert>}

      {sectionJeunes && (
        <TabLinks
          tabs={(["adultes", "jeunes"] as const).map((p) => {
            const params = new URLSearchParams({
              ...(recherche ? { q: recherche } : {}),
              ...(sectionId ? { sectionId } : {}),
              ...(reinscription ? { reinscription } : {}),
              ...(anneeSelectionneeId ? { anneeId: anneeSelectionneeId } : {}),
              ...(statutFiltre !== "valide" ? { statut: statutFiltre } : {}),
              population: p,
            });
            return {
              id: p,
              label: p === "adultes" ? "Adultes" : "Jeunes",
              href: `/etudiants?${params}`,
              active: populationSelectionnee === p,
            };
          })}
        />
      )}

      <form className={TOOLBAR_CLASSES} action="/etudiants" method="GET">
        <input type="hidden" name="population" value={populationSelectionnee} />
        <div>
          <label htmlFor="q" className="sr-only">
            Rechercher par nom ou prénom
          </label>
          <input
            id="q"
            type="search"
            name="q"
            defaultValue={recherche}
            placeholder="Nom ou prénom…"
            className={`w-40 ${CONTROL_SM_CLASSES}`}
          />
        </div>
        <div>
          <label htmlFor="anneeId" className="sr-only">
            Année scolaire
          </label>
          <AutoSubmitSelect
            id="anneeId"
            name="anneeId"
            defaultValue={anneeSelectionneeId ?? ""}
            className={CONTROL_SM_CLASSES}
          >
            {anneeScolaires.length === 0 && <option value="">Aucune année scolaire</option>}
            {anneeScolaires.map((a) => (
              <option key={a.id} value={a.id}>
                {a.libelle}
                {a.active ? " (active)" : ""}
              </option>
            ))}
          </AutoSubmitSelect>
        </div>
        <div>
          <label htmlFor="sectionId" className="sr-only">
            Section
          </label>
          <AutoSubmitSelect
            id="sectionId"
            name="sectionId"
            defaultValue={sectionId ?? ""}
            className={CONTROL_SM_CLASSES}
          >
            <option value="">Toutes sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </AutoSubmitSelect>
        </div>
        <div>
          <label htmlFor="reinscription" className="sr-only">
            Statut d&apos;inscription
          </label>
          <AutoSubmitSelect
            id="reinscription"
            name="reinscription"
            defaultValue={reinscription ?? ""}
            className={CONTROL_SM_CLASSES}
          >
            <option value="">Statut : tous</option>
            <option value="oui">Inscrits</option>
            <option value="non">Non inscrits</option>
          </AutoSubmitSelect>
        </div>
        <div>
          <label htmlFor="statut" className="sr-only">
            Dossier
          </label>
          <AutoSubmitSelect
            id="statut"
            name="statut"
            defaultValue={statutFiltre}
            className={CONTROL_SM_CLASSES}
          >
            <option value="valide">Dossiers validés</option>
            <option value="preinscrit">Préinscriptions seulement</option>
            <option value="tous">Tous (validés + préinscriptions)</option>
          </AutoSubmitSelect>
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Rechercher
        </button>
        <a
          href={`/etudiants/export?${new URLSearchParams({
            ...(recherche ? { q: recherche } : {}),
            ...(sectionId ? { sectionId } : {}),
            ...(reinscription ? { reinscription } : {}),
            ...(anneeSelectionneeId ? { anneeId: anneeSelectionneeId } : {}),
            ...(statutFiltre !== "valide" ? { statut: statutFiltre } : {}),
            ...(sectionJeunes ? { population: populationSelectionnee } : {}),
          }).toString()}`}
          className={buttonVariants({ variant: "secondary", size: "sm", className: "ml-auto" })}
        >
          Exporter en CSV
        </a>
        <p className="basis-full text-xs text-ink-faint">
          Section(s) et statut se lisent pour l&apos;année scolaire choisie
          ci-dessus (par défaut l&apos;année active). L&apos;export reprend
          la recherche et tous les filtres.
        </p>
      </form>

      <TableWrap>
        <TableHead>
          <th className="px-4 py-3">Nom</th>
          <th className="px-4 py-3">Prénom</th>
          <th className="px-4 py-3">Section(s)</th>
          <th className="px-4 py-3">Inscription</th>
          <th className="px-4 py-3">Dossier</th>
          <th className="px-4 py-3">Cotisation</th>
          <th className="px-4 py-3">Téléphone</th>
          <th className="px-4 py-3">Email</th>
        </TableHead>
        <tbody className="divide-y divide-border">
          {etudiants.map((e) => {
            const sectionsEtudiant = sectionsDInscriptions(e.inscriptions);
            const dossierComplet = dossierDocumentaireComplet(e.documents);
            const dossierActif = e.dossiersAnnuels[0];
            const cotisation = dossierActif ? statutCotisation(dossierActif) : null;
            return (
              <tr key={e.id} className="relative hover:bg-bg-sunken/40">
                <td className="px-4 py-3 font-medium text-ink">
                  <Link
                    href={`/etudiants/${e.id}`}
                    className="after:absolute after:inset-0 hover:underline"
                  >
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
                  {estNouveauParCompteur(e) ? (
                    estReinscrit(e) ? (
                      <Badge variant="success">Inscrit</Badge>
                    ) : (
                      <Badge variant="warning">Non inscrit</Badge>
                    )
                  ) : estReinscrit(e) ? (
                    <Badge variant="success">Réinscrit</Badge>
                  ) : (
                    <Badge variant="warning">Non réinscrit</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  {dossierComplet ? (
                    <Badge variant="success">Complet</Badge>
                  ) : (
                    <Badge variant="warning">Incomplet</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  {cotisation ? (
                    <Badge variant={STATUT_COTISATION_VARIANTS[cotisation.statut]}>
                      {cotisation.statut}
                    </Badge>
                  ) : (
                    <Badge variant="neutral">Aucun dossier</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-muted">{e.telephoneMobile ?? "—"}</td>
                <td className="px-4 py-3 text-ink-muted">{e.email ?? "—"}</td>
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
