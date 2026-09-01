import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { ClipboardList } from "lucide-react";
import { requireModule, Module } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardTitle } from "@/components/ui/card";
import { TableWrap, TableHead } from "@/components/ui/table";
import { IconChip } from "@/components/ui/icon-chip";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CONTROL_SM_CLASSES, TOOLBAR_CLASSES } from "@/components/ui/champ";

export default async function InscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireModule(Module.INSCRIPTIONS, "LECTURE");
  const { q } = await searchParams;
  const recherche = q?.trim() ?? "";

  // Même logique que le QR permanent de salle (voir
  // (app)/classes/[id]/page.tsx) : un scanner de téléphone n'ouvre un lien
  // que si le contenu est une URL absolue. PUBLIC_HOST permet de forcer
  // l'IP/le nom réellement accessible depuis l'accueil si l'appli est
  // servie en interne via "localhost" ou un nom non joignable par un
  // téléphone (voir .env.example).
  const enTetes = await headers();
  const hote = process.env.PUBLIC_HOST || enTetes.get("host") || "localhost:3000";
  const protocole = enTetes.get("x-forwarded-proto") ?? "http";
  const urlPreinscription = `${protocole}://${hote}/preinscription`;
  const qrSvg = await QRCode.toString(urlPreinscription, { type: "svg", margin: 1, width: 160 });

  const preinscrits = await prisma.etudiant.findMany({
    where: {
      statutInscription: "PREINSCRIT",
      ...(recherche
        ? {
            OR: [
              { nom: { contains: recherche, mode: "insensitive" } },
              { prenom: { contains: recherche, mode: "insensitive" } },
            ],
          }
        : {}),
    },
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
        <div className="mt-4 flex flex-wrap items-start gap-4 border-t border-border pt-4">
          <div
            className="inline-block rounded-lg bg-bg-elevated p-2 ring-1 ring-border"
            // SVG produit côté serveur par la bibliothèque qrcode à partir
            // d'un chemin interne : aucune donnée utilisateur n'y transite.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="max-w-xs">
            <p className="text-sm font-medium text-ink">QR d&apos;accueil</p>
            <p className="mt-1 text-xs text-ink-faint">
              À afficher ou imprimer à l&apos;accueil : un futur étudiant sur
              place peut le scanner pour ouvrir directement le formulaire de
              préinscription sur son téléphone, sans que le staff ait à le
              saisir à sa place.
            </p>
            <p className="mt-2 break-all font-mono text-xs text-ink-faint">{urlPreinscription}</p>
          </div>
        </div>
      </Card>

      <form className={TOOLBAR_CLASSES} action="/inscriptions" method="GET">
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
            className={`w-48 ${CONTROL_SM_CLASSES}`}
          />
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Rechercher
        </button>
        {recherche && (
          <Link href="/inscriptions" className="text-xs font-medium text-ink-muted hover:underline">
            Réinitialiser
          </Link>
        )}
      </form>

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
                {recherche
                  ? "Aucune préinscription ne correspond à cette recherche."
                  : "Aucune préinscription en attente."}
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
    </div>
  );
}
