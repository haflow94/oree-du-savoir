import Link from "next/link";
import { CreditCard } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formaterMontant, statutCotisation, STATUT_COTISATION_VARIANTS } from "@/lib/paiements";
import { requireModule, peutAccederModule, Module } from "@/lib/permissions";
import { filtreParSection, sectionsDInscriptions } from "@/lib/sections-etudiant";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableWrap, TableHead } from "@/components/ui/table";
import { AutoSubmitSelect, AutoSubmitInput } from "@/components/ui/auto-submit";
import { CONTROL_SM_CLASSES, TOOLBAR_CLASSES } from "@/components/ui/champ";
import { IconChip } from "@/components/ui/icon-chip";

const LABEL_XS_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

export default async function PaiementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    anneeScolaireId?: string;
    sectionId?: string;
    q?: string;
    archives?: string;
  }>;
}) {
  const session = await requireModule(Module.PAIEMENTS, "LECTURE");
  const peutCreer = await peutAccederModule(session.role, Module.PAIEMENTS, "ECRITURE");
  const { anneeScolaireId, sectionId, q, archives } = await searchParams;
  const recherche = q?.trim() ?? "";
  const voirArchives = archives === "1";

  const [annees, sections, anneeActive] = await Promise.all([
    prisma.anneeScolaire.findMany({ orderBy: { libelle: "desc" } }),
    prisma.section.findMany({ orderBy: { nom: "asc" } }),
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
  ]);

  // Comme pour la page Classes : sans filtre explicite dans l'URL (première
  // visite), on reprend l'année active plutôt que de tout mélanger. "" venant
  // du filtre "Toutes les années" reste un choix explicite.
  const anneeFiltre = anneeScolaireId !== undefined ? anneeScolaireId : anneeActive?.id ?? "";

  const filtreEtudiant = {
    ...(sectionId ? filtreParSection(anneeFiltre || (anneeActive?.id ?? ""), sectionId) : {}),
    ...(recherche
      ? {
          OR: [
            { nom: { contains: recherche, mode: "insensitive" as const } },
            { prenom: { contains: recherche, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const dossiers = await prisma.dossierAnnuel.findMany({
    where: {
      ...(anneeFiltre ? { anneeScolaireId: anneeFiltre } : {}),
      ...(!voirArchives && !anneeFiltre ? { anneeScolaire: { archivee: false } } : {}),
      ...(Object.keys(filtreEtudiant).length > 0 ? { etudiant: filtreEtudiant } : {}),
    },
    orderBy: [{ anneeScolaire: { libelle: "desc" } }, { etudiant: { nom: "asc" } }],
    include: {
      etudiant: {
        include: {
          inscriptions: {
            include: { classe: { include: { cohorte: { include: { cours: { include: { section: true } } } } } } },
          },
        },
      },
      anneeScolaire: true,
      echeances: { include: { paiements: true }, orderBy: { dateEcheance: "asc" } },
    },
  });

  const paramsExport = new URLSearchParams({
    ...(anneeFiltre ? { anneeScolaireId: anneeFiltre } : {}),
    ...(sectionId ? { sectionId } : {}),
    ...(recherche ? { q: recherche } : {}),
  }).toString();

  // Une colonne par échéance réelle (pas par mois calendaire fixe, voir
  // Projet/03_Analyse_existant_Excel.md §10) : le nombre de colonnes s'adapte
  // aux dossiers affichés, chaque cellule reflète le montant/statut propre à
  // CETTE échéance-là (montants et dates restent libres par dossier).
  const maxEcheances = dossiers.reduce((max, d) => Math.max(max, d.echeances.length), 0);
  const colonnesEcheances = Array.from({ length: maxEcheances }, (_, i) => i);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconChip icon={CreditCard} accent="ochre" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-semibold text-pine-strong">Paiements</h1>
              {anneeActive && <Badge variant="success">Année active : {anneeActive.libelle}</Badge>}
            </div>
            <p className="text-sm text-ink-muted">
              Montant dû, échéances, encaissé, reste, par étudiant et par
              année. Le dossier annuel porte le montant dû global (voir la
              fiche pour les échéances et le détail des paiements).
            </p>
          </div>
        </div>
        {peutCreer && (
          <Link href="/paiements/nouveau" className={buttonVariants({ variant: "primary" })}>
            + Nouveau dossier
          </Link>
        )}
      </div>

      <form className={TOOLBAR_CLASSES} action="/paiements" method="GET">
        <div>
          <label htmlFor="q" className={LABEL_XS_CLASSES}>
            Étudiant
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
          <label className={LABEL_XS_CLASSES}>Année scolaire</label>
          <AutoSubmitSelect
            name="anneeScolaireId"
            defaultValue={anneeFiltre}
            className={CONTROL_SM_CLASSES}
          >
            <option value="">Toutes les années</option>
            {annees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.libelle}
                {a.active ? " (active)" : ""}
                {a.archivee ? " (archivée)" : ""}
              </option>
            ))}
          </AutoSubmitSelect>
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <AutoSubmitInput type="checkbox" name="archives" value="1" defaultChecked={voirArchives} />
            Voir les archives
          </label>
        </div>
        <div>
          <label className={LABEL_XS_CLASSES}>Section</label>
          <AutoSubmitSelect name="sectionId" defaultValue={sectionId ?? ""} className={CONTROL_SM_CLASSES}>
            <option value="">Toutes les sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </AutoSubmitSelect>
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Rechercher
        </button>
        <a
          href={`/paiements/export?${paramsExport}`}
          className={buttonVariants({ variant: "secondary", size: "sm", className: "ml-auto" })}
        >
          Exporter en CSV
        </a>
        <p className="basis-full text-xs text-ink-faint">
          L&apos;export reprend l&apos;étudiant, l&apos;année et la section
          ci-dessus (laissez « Toutes » pour tout exporter).
        </p>
      </form>

      <TableWrap>
        <TableHead>
          <th className="px-4 py-3">Étudiant</th>
          <th className="px-4 py-3">Année</th>
          <th className="px-4 py-3">Section</th>
          <th className="px-4 py-3">Dû</th>
          {colonnesEcheances.map((i) => (
            <th key={i} className="whitespace-nowrap px-4 py-3">
              Échéance {i + 1}
            </th>
          ))}
          <th className="px-4 py-3">Encaissé</th>
          <th className="px-4 py-3">Reste</th>
          <th className="px-4 py-3">Statut</th>
        </TableHead>
        <tbody className="divide-y divide-border">
          {dossiers.map((d) => {
            const { du, encaisse, reste, statut } = statutCotisation(d);
            const statutVariant = STATUT_COTISATION_VARIANTS[statut];
            // Sections déduites des inscriptions actives sur l'année DU
            // DOSSIER (pas forcément l'année filtrée en haut de page, quand
            // "Toutes les années" est sélectionné) — voir lib/sections-etudiant.ts.
            const sectionsEtudiant = sectionsDInscriptions(
              d.etudiant.inscriptions.filter((i) => i.classe.anneeScolaireId === d.anneeScolaireId),
            );

            return (
              <tr key={d.id} className="hover:bg-bg-sunken/40">
                <td className="px-4 py-3 font-medium text-ink">
                  <Link href={`/paiements/${d.id}`} className="hover:underline">
                    {d.etudiant.prenom} {d.etudiant.nom}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={d.anneeScolaireId === anneeActive?.id ? "success" : "neutral"}>
                    {d.anneeScolaire.libelle}
                  </Badge>
                  {d.anneeScolaire.archivee && (
                    <span className="ml-1">
                      <Badge variant="neutral">Archivée</Badge>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {sectionsEtudiant.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {sectionsEtudiant.map((s) => (
                        <Badge key={s.id} variant="neutral">
                          {s.nom}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-muted">{formaterMontant(du)}</td>
                {colonnesEcheances.map((i) => {
                  const e = d.echeances[i];
                  if (!e) {
                    return (
                      <td key={i} className="px-4 py-3 text-ink-faint">
                        —
                      </td>
                    );
                  }
                  const montantEcheance = Number.parseFloat(e.montant.toString());
                  const encaisseEcheance = e.paiements.reduce(
                    (total, p) => total + Number.parseFloat(p.montant.toString()),
                    0,
                  );
                  const echeanceVariant =
                    encaisseEcheance >= montantEcheance
                      ? "success"
                      : encaisseEcheance > 0
                        ? "warning"
                        : "danger";
                  return (
                    <td key={i} className="whitespace-nowrap px-4 py-3" title={e.libelle || "Échéance"}>
                      <Badge variant={echeanceVariant}>{formaterMontant(montantEcheance)}</Badge>
                      <div className="mt-1 text-xs text-ink-faint">
                        {new Date(e.dateEcheance).toLocaleDateString("fr-FR")}
                      </div>
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-ink-muted">{formaterMontant(encaisse)}</td>
                <td className="px-4 py-3 text-ink-muted">{formaterMontant(reste)}</td>
                <td className="px-4 py-3">
                  <Badge variant={statutVariant}>{statut}</Badge>
                </td>
              </tr>
            );
          })}
          {dossiers.length === 0 && (
            <tr>
              <td colSpan={7 + maxEcheances} className="px-4 py-8 text-center text-ink-faint">
                Aucun dossier de paiement pour l&apos;instant.
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
      <p className="text-xs text-ink-faint">
        Survolez le montant d&apos;une échéance pour voir son libellé. Vert =
        réglée, orange = partiellement réglée, rouge = impayée.
      </p>
    </div>
  );
}
