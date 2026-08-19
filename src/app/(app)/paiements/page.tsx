import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formaterMontant } from "@/lib/paiements";
import { Role, hasRole } from "@/lib/roles";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableWrap, TableHead } from "@/components/ui/table";

const PEUT_CREER = [Role.ACCUEIL, Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU];
const CONTROL_CLASSES =
  "rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";
const LABEL_XS_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

export default async function PaiementsPage() {
  const session = await requireSession();

  const [dossiers, annees] = await Promise.all([
    prisma.dossierAnnuel.findMany({
      orderBy: [{ anneeScolaire: { libelle: "desc" } }, { etudiant: { nom: "asc" } }],
      include: {
        etudiant: true,
        anneeScolaire: true,
        echeances: { include: { paiements: true } },
      },
    }),
    prisma.anneeScolaire.findMany({ orderBy: { libelle: "desc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-pine-strong">Paiements</h1>
          <p className="text-sm text-ink-muted">
            Montant dû, échéances, encaissé, reste, par étudiant et par
            année. Le dossier annuel porte le montant dû global (voir la
            fiche pour les échéances et le détail des paiements).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <form action="/paiements/export" method="GET" className="flex items-end gap-2">
            <div>
              <label className={LABEL_XS_CLASSES}>Exporter (année)</label>
              <select name="anneeScolaireId" defaultValue="" className={CONTROL_CLASSES}>
                <option value="">Toutes les années</option>
                {annees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.libelle}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={buttonVariants({ variant: "secondary" })}>
              Exporter en CSV
            </button>
          </form>
          {hasRole(session.role, PEUT_CREER) && (
            <Link href="/paiements/nouveau" className={buttonVariants({ variant: "primary" })}>
              + Nouveau dossier
            </Link>
          )}
        </div>
      </div>

      <TableWrap>
        <TableHead>
          <th className="px-4 py-3">Étudiant</th>
          <th className="px-4 py-3">Année</th>
          <th className="px-4 py-3">Dû</th>
          <th className="px-4 py-3">Échéances</th>
          <th className="px-4 py-3">Encaissé</th>
          <th className="px-4 py-3">Reste</th>
          <th className="px-4 py-3">Statut</th>
        </TableHead>
        <tbody className="divide-y divide-border">
          {dossiers.map((d) => {
            const du = Number.parseFloat(d.montantDu.toString());
            const paiements = d.echeances.flatMap((e) => e.paiements);
            const encaisse = paiements.reduce(
              (total, p) => total + Number.parseFloat(p.montant.toString()),
              0,
            );
            const reste = du - encaisse;
            const statut = reste <= 0 ? "Soldé" : encaisse > 0 ? "Partiel" : "Impayé";
            const statutVariant =
              statut === "Soldé" ? "success" : statut === "Partiel" ? "warning" : "danger";

            return (
              <tr key={d.id} className="hover:bg-bg-sunken/40">
                <td className="px-4 py-3 font-medium text-ink">
                  <Link href={`/paiements/${d.id}`} className="hover:underline">
                    {d.etudiant.prenom} {d.etudiant.nom}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-muted">{d.anneeScolaire.libelle}</td>
                <td className="px-4 py-3 text-ink-muted">{formaterMontant(du)}</td>
                <td className="px-4 py-3 text-ink-muted">
                  {paiements.length} paiement(s) / {d.echeances.length} échéance(s)
                </td>
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
              <td colSpan={7} className="px-4 py-8 text-center text-ink-faint">
                Aucun dossier de paiement pour l&apos;instant.
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
    </div>
  );
}
