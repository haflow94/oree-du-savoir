import Link from "next/link";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { dossierDocumentaireComplet } from "@/lib/documents";
import { TableWrap, TableHead } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { IconChip } from "@/components/ui/icon-chip";
import { buttonVariants } from "@/components/ui/button";
import { CONTROL_SM_CLASSES, TOOLBAR_CLASSES } from "@/components/ui/champ";
import { requireModule, Module } from "@/lib/permissions";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireModule(Module.DOCUMENTS, "LECTURE");
  const { q } = await searchParams;
  const recherche = q?.trim() ?? "";

  // Une ligne par étudiant plutôt que par fichier : la gestion fine de
  // chaque document (voir, télécharger, supprimer) vit sur sa fiche — ce
  // tableau sert seulement à retrouver le bon étudiant, pas à dupliquer ces
  // actions ici (source de confusion entre les documents d'une même ligne).
  const etudiants = await prisma.etudiant.findMany({
    where: {
      documents: { some: {} },
      ...(recherche
        ? {
            OR: [
              { nom: { contains: recherche, mode: "insensitive" } },
              { prenom: { contains: recherche, mode: "insensitive" } },
              { documents: { some: { nomFichier: { contains: recherche, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    include: {
      documents: { select: { type: true, creeLe: true } },
    },
  });

  const lignes = etudiants
    .map((e) => ({
      id: e.id,
      nom: e.nom,
      prenom: e.prenom,
      nombreDocuments: e.documents.length,
      dossierComplet: dossierDocumentaireComplet(e.documents),
      dernierAjout: e.documents.reduce(
        (plusRecent, d) => (d.creeLe > plusRecent ? d.creeLe : plusRecent),
        e.documents[0].creeLe,
      ),
    }))
    .sort((a, b) => b.dernierAjout.getTime() - a.dernierAjout.getTime());

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <IconChip icon={FileText} accent="sky" />
        <div>
          <h1 className="font-display text-3xl font-semibold text-pine-strong">Documents</h1>
          <p className="text-sm text-ink-muted">
            Étudiants ayant au moins un document rattaché (identité, photo,
            dossiers, justificatifs). Stockés séparément de la base, la
            gestion détaillée se fait depuis la fiche de chaque étudiant.
          </p>
        </div>
      </div>

      <form className={TOOLBAR_CLASSES} action="/documents" method="GET">
        <div>
          <label htmlFor="q" className="sr-only">
            Rechercher par étudiant ou nom de fichier
          </label>
          <input
            id="q"
            type="search"
            name="q"
            defaultValue={recherche}
            placeholder="Étudiant ou nom de fichier…"
            className={`w-64 ${CONTROL_SM_CLASSES}`}
          />
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Rechercher
        </button>
      </form>

      <TableWrap>
        <TableHead>
          <th className="px-4 py-3">Étudiant</th>
          <th className="px-4 py-3">Dossier</th>
          <th className="px-4 py-3">Documents</th>
          <th className="px-4 py-3">Dernier ajout</th>
          <th className="px-4 py-3"></th>
        </TableHead>
        <tbody className="divide-y divide-border">
          {lignes.map((e) => (
            <tr key={e.id} className="hover:bg-bg-sunken/40">
              <td className="px-4 py-3 font-medium text-ink">
                <Link href={`/etudiants/${e.id}#zone-documents`} className="hover:underline">
                  {e.prenom} {e.nom}
                </Link>
              </td>
              <td className="px-4 py-3">
                {e.dossierComplet ? (
                  <Badge variant="success">Complet</Badge>
                ) : (
                  <Badge variant="warning">Incomplet</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-ink-muted">
                {e.nombreDocuments} document{e.nombreDocuments > 1 ? "s" : ""}
              </td>
              <td className="px-4 py-3 text-ink-muted">
                {e.dernierAjout.toLocaleDateString("fr-FR")}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/etudiants/${e.id}#zone-documents`}
                  className="text-xs font-medium text-pine hover:underline"
                >
                  Voir ses documents
                </Link>
              </td>
            </tr>
          ))}
          {lignes.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-ink-faint">
                {recherche
                  ? "Aucun étudiant ne correspond à cette recherche."
                  : "Aucun document pour l'instant."}
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
    </div>
  );
}
