import Link from "next/link";
import { FileText } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { TYPE_DOCUMENT_LABELS, dossierDocumentaireComplet } from "@/lib/documents";
import { TableWrap, TableHead } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { IconChip } from "@/components/ui/icon-chip";
import { buttonVariants } from "@/components/ui/button";
import { CONTROL_SM_CLASSES, TOOLBAR_CLASSES } from "@/components/ui/champ";

const PEUT_VOIR = [Role.ACCUEIL, Role.ADMINISTRATION, Role.BUREAU];

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRole(PEUT_VOIR);
  const { q } = await searchParams;
  const recherche = q?.trim() ?? "";

  const documents = await prisma.document.findMany({
    where: recherche
      ? {
          OR: [
            { nomFichier: { contains: recherche, mode: "insensitive" } },
            { etudiant: { nom: { contains: recherche, mode: "insensitive" } } },
            { etudiant: { prenom: { contains: recherche, mode: "insensitive" } } },
          ],
        }
      : undefined,
    orderBy: { creeLe: "desc" },
    include: {
      etudiant: {
        include: { documents: { select: { type: true } } },
      },
    },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <IconChip icon={FileText} accent="sky" />
        <div>
          <h1 className="font-display text-3xl font-semibold text-pine-strong">Documents</h1>
          <p className="text-sm text-ink-muted">
            Fichiers rattachés aux étudiants (identité, photo, dossiers,
            justificatifs). Stockés séparément de la base, uniquement les
            métadonnées apparaissent ici.
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
          <th className="px-4 py-3">Type</th>
          <th className="px-4 py-3">Fichier</th>
          <th className="px-4 py-3">Ajouté le</th>
        </TableHead>
        <tbody className="divide-y divide-border">
          {documents.map((d) => {
            const dossierComplet = dossierDocumentaireComplet(d.etudiant.documents);
            return (
              <tr key={d.id} className="hover:bg-bg-sunken/40">
                <td className="px-4 py-3 font-medium text-ink">
                  <Link href={`/etudiants/${d.etudiantId}`} className="hover:underline">
                    {d.etudiant.prenom} {d.etudiant.nom}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {dossierComplet ? (
                    <Badge variant="success">Complet</Badge>
                  ) : (
                    <Badge variant="warning">Incomplet</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-muted">{TYPE_DOCUMENT_LABELS[d.type]}</td>
                <td className="px-4 py-3 text-ink-muted">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-ink">{d.nomFichier}</span>
                    <a
                      href={`/etudiants/${d.etudiantId}/documents/${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-pine hover:underline"
                    >
                      Voir
                    </a>
                    <a
                      href={`/etudiants/${d.etudiantId}/documents/${d.id}?telecharger=1`}
                      className="text-xs font-medium text-pine hover:underline"
                    >
                      Télécharger
                    </a>
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {new Date(d.creeLe).toLocaleDateString("fr-FR")}
                </td>
              </tr>
            );
          })}
          {documents.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-ink-faint">
                {recherche
                  ? "Aucun document ne correspond à cette recherche."
                  : "Aucun document pour l'instant."}
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
    </div>
  );
}
