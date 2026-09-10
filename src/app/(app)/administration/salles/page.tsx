import { headers } from "next/headers";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";
import { creerSalleAction, renommerSalleAction, supprimerSalleAction } from "./actions";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardTitle } from "@/components/ui/card";
import { Champ } from "@/components/ui/champ";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PrintButton } from "@/components/ui/print-button";
import { AdminSubNav } from "../sub-nav";

const MESSAGES: Record<string, string> = {
  CHAMPS_INVALIDES: "Donnez un nom à la salle.",
  NOM_DEJA_UTILISE: "Une salle porte déjà ce nom.",
  INTROUVABLE: "Cette salle n'existe plus.",
  SALLE_UTILISEE:
    "Impossible de supprimer : des classes sont rattachées à cette salle. Réaffectez-les d'abord depuis la page Classes.",
};

export default async function SallesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireModule(Module.ADMINISTRATION, "ECRITURE");
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const salles = await prisma.salle.findMany({
    orderBy: { nom: "asc" },
    include: { _count: { select: { classes: true } } },
  });

  // Un scanner de QR sur téléphone n'ouvre un lien que si le contenu est une
  // URL absolue (schéma + hôte) — voir la même logique sur la fiche d'une
  // classe (classes/[id]/page.tsx) pour le détail de PUBLIC_HOST.
  const enTetes = await headers();
  const hote = process.env.PUBLIC_HOST || enTetes.get("host") || "localhost:3000";
  const protocole = enTetes.get("x-forwarded-proto") ?? "http";

  const sallesAvecQr = await Promise.all(
    salles.map(async (s) => {
      const urlQr = `${protocole}://${hote}/qr/${s.qrToken}`;
      const [qrSvg, qrSvgImpression] = await Promise.all([
        QRCode.toString(urlQr, { type: "svg", margin: 1, width: 140 }),
        // Version imprimée en plus grand : affichée sur un mur/une porte,
        // elle doit rester scannable à distance.
        QRCode.toString(urlQr, { type: "svg", margin: 1, width: 320 }),
      ]);
      return { ...s, urlQr, qrSvg, qrSvgImpression };
    }),
  );

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <BackLink href="/administration" label="Administration" />
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold text-pine-strong">Salles</h1>
          {salles.length > 0 && (
            <PrintButton>Imprimer tous les QR codes</PrintButton>
          )}
        </div>
        <p className="text-sm text-ink-muted">
          Chaque salle porte un QR permanent : à afficher ou imprimer une
          bonne fois pour toutes, il ne change jamais tant que la salle
          existe. Le QR ne connecte personne — l&apos;enseignant qui le
          scanne doit être authentifié, puis choisit parmi les cours du jour
          dans cette salle qui le concernent.
        </p>
      </div>

      <div className="print:hidden">
        <AdminSubNav current="/administration/salles" />
      </div>

      <div className="print:hidden">
        {message && <Alert variant="danger">{message}</Alert>}
        {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}
      </div>

      <Card className="print:hidden">
        <CardTitle>Créer une salle</CardTitle>
        <form action={creerSalleAction} className="mt-3 flex flex-wrap items-end gap-3">
          <Champ label="Nom" name="nom" id="nom-nouvelle-salle" required placeholder="ex. Salle 1" />
          <SubmitButton variant="primary" pendingLabel="Création…">
            Créer la salle
          </SubmitButton>
        </form>
      </Card>

      {/* Une salle par page, uniquement visible à l'impression (voir
          PrintButton) : le rendu écran ci-dessous (compact, avec actions de
          gestion) n'est pas adapté à l'affichage mural. */}
      <div className="hidden print:block">
        {sallesAvecQr.map((s, i) => (
          <div
            key={s.id}
            className={`flex min-h-screen flex-col items-center justify-center gap-6 ${
              i < sallesAvecQr.length - 1 ? "break-after-page" : ""
            }`}
          >
            <h2 className="font-display text-4xl font-semibold">{s.nom}</h2>
            <div dangerouslySetInnerHTML={{ __html: s.qrSvgImpression }} />
          </div>
        ))}
      </div>

      <div className="space-y-3 print:hidden">
        {sallesAvecQr.map((s) => (
          <Card key={s.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium text-ink">{s.nom}</span>
                  <span className="text-xs text-ink-faint">
                    {s._count.classes} classe{s._count.classes > 1 ? "s" : ""} rattachée
                    {s._count.classes > 1 ? "s" : ""}
                  </span>
                </div>
                <form action={renommerSalleAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="salleId" value={s.id} />
                  <Champ
                    label="Renommer"
                    name="nom"
                    id={`nom-${s.id}`}
                    required
                    defaultValue={s.nom}
                  />
                  <SubmitButton variant="secondary" pendingLabel="Enregistrement…">
                    Enregistrer
                  </SubmitButton>
                </form>
                <div>
                  <form id={`supprimer-salle-${s.id}`} action={supprimerSalleAction}>
                    <input type="hidden" name="salleId" value={s.id} />
                  </form>
                  <ConfirmDialog
                    formId={`supprimer-salle-${s.id}`}
                    triggerLabel="Supprimer"
                    title="Supprimer cette salle ?"
                    description={`Cette action supprime définitivement la salle « ${s.nom} » et son QR, et ne peut pas être annulée.`}
                    confirmLabel="Supprimer définitivement"
                    disabled={s._count.classes > 0}
                    disabledTitle="Des classes sont rattachées à cette salle : impossible de la supprimer."
                  />
                </div>
              </div>
              <div className="shrink-0 text-center">
                <div
                  className="inline-block rounded-lg bg-bg-elevated p-2 ring-1 ring-border"
                  // SVG produit côté serveur par la bibliothèque qrcode à
                  // partir d'un chemin interne : aucune donnée utilisateur
                  // n'y transite.
                  dangerouslySetInnerHTML={{ __html: s.qrSvg }}
                />
                <p className="mt-1 max-w-[160px] break-all font-mono text-[10px] text-ink-faint">
                  {s.urlQr}
                </p>
              </div>
            </div>
          </Card>
        ))}
        {salles.length === 0 && <EmptyState message="Aucune salle enregistrée." />}
      </div>
    </div>
  );
}
