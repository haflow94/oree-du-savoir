import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requireModule, Module } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardTitle } from "@/components/ui/card";
import { TableWrap, TableHead } from "@/components/ui/table";
import { IconChip } from "@/components/ui/icon-chip";
import { Badge } from "@/components/ui/badge";

export default async function InscriptionsPage() {
  await requireModule(Module.INSCRIPTIONS, "LECTURE");

  const preinscrits = await prisma.etudiant.findMany({
    where: { statutInscription: "PREINSCRIT" },
    orderBy: { creeLe: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <IconChip icon={ClipboardList} accent="sky" />
        <div>
          <h1 className="font-display text-3xl font-semibold text-pine-strong">Inscriptions</h1>
          <p className="text-sm text-ink-muted">
            Préinscriptions en attente de contrôle sur place (signature,
            documents, paiement) avant validation.
          </p>
        </div>
      </div>

      <Card>
        <CardTitle>Formulaire public</CardTitle>
        <p className="mt-1 text-sm text-ink-muted">
          Les futurs étudiants peuvent préremplir leur dossier sans compte
          depuis{" "}
          <code className="rounded bg-bg-sunken px-1.5 py-0.5 text-xs">/preinscription</code>.
        </p>
      </Card>

      <TableWrap>
        <TableHead>
          <th className="px-4 py-3">Nom</th>
          <th className="px-4 py-3">Reçu le</th>
          <th className="px-4 py-3">Remarque</th>
        </TableHead>
        <tbody className="divide-y divide-border">
          {preinscrits.map((e) => (
            <tr key={e.id} className="hover:bg-bg-sunken/40">
              <td className="px-4 py-3 font-medium text-ink">
                <Link href={`/etudiants/${e.id}`} className="hover:underline">
                  {e.prenom} {e.nom}
                </Link>
                {e.doublonPotentielId && (
                  <span className="ml-2">
                    <Badge variant="warning">Doublon possible</Badge>
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-ink-muted">
                {new Date(e.creeLe).toLocaleDateString("fr-FR")}
              </td>
              <td className="px-4 py-3 text-ink-muted">{e.remarque ?? "—"}</td>
            </tr>
          ))}
          {preinscrits.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-8 text-center text-ink-faint">
                Aucune préinscription en attente.
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
    </div>
  );
}
