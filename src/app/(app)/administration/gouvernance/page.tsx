import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";
import { TYPE_DOCUMENT_ASSOCIATION_LABELS } from "@/lib/documents";
import {
  creerMembreCAAction,
  marquerSortantMembreCAAction,
  supprimerMembreCAAction,
  creerReunionAction,
  supprimerReunionAction,
  televerserDocumentAssociationAction,
  supprimerDocumentAssociationAction,
} from "./actions";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardTitle } from "@/components/ui/card";
import { Champ, ChampSelect } from "@/components/ui/champ";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Les champs obligatoires doivent être renseignés.",
  FICHIER_MANQUANT: "Choisissez un fichier avant de l'ajouter.",
  INTROUVABLE: "Cet élément n'existe plus.",
  EMAIL_INVALIDE: "Cet email n'a pas un format valide.",
};

const TYPE_REUNION_LABELS: Record<string, string> = { CA: "Conseil d'administration", AG: "Assemblée générale" };

function formatDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export default async function GouvernancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireModule(Module.GOUVERNANCE, "ECRITURE");
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const [membres, reunions, documentsReference] = await Promise.all([
    prisma.membreCA.findMany({ orderBy: [{ dateSortie: "asc" }, { dateEntree: "asc" }] }),
    prisma.reunionGouvernance.findMany({
      orderBy: { date: "desc" },
      include: { documents: true },
    }),
    prisma.documentAssociation.findMany({
      where: { reunionId: null },
      orderBy: { creeLe: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/administration" label="Administration" />
        <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">Gouvernance</h1>
        <p className="text-sm text-ink-muted">
          Membres du Conseil d&apos;administration, réunions CA/AG et PV, règlement
          intérieur et statuts. Accès réservé au Bureau — les membres du CA n&apos;ont
          pas de compte dans l&apos;application.
        </p>
      </div>

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      <Card>
        <CardTitle>Membres du CA</CardTitle>
        <form action={creerMembreCAAction} className="mt-3 grid gap-3 sm:grid-cols-5">
          <Champ label="Nom" name="nom" id="nom-membre" required />
          <Champ label="Prénom" name="prenom" id="prenom-membre" required />
          <Champ label="Fonction" name="fonction" id="fonction-membre" placeholder="Président, Trésorier…" />
          <Champ label="Email" name="email" id="email-membre" type="email" />
          <Champ label="Date d'entrée" name="dateEntree" id="date-entree-membre" type="date" required />
          <div className="flex justify-end sm:col-span-5">
            <Button type="submit" variant="primary">
              Ajouter le membre
            </Button>
          </div>
        </form>

        <div className="mt-5 divide-y divide-border">
          {membres.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="font-medium text-ink">
                  {m.prenom} {m.nom}
                  {m.fonction && <span className="ml-2 text-xs font-normal text-ink-faint">{m.fonction}</span>}
                </div>
                <div className="text-xs text-ink-faint">
                  Entré le {formatDate(m.dateEntree)}
                  {m.dateSortie ? ` · sorti le ${formatDate(m.dateSortie)}` : ""}
                  {m.email ? ` · ${m.email}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {m.dateSortie ? (
                  <Badge variant="neutral">Ancien membre</Badge>
                ) : (
                  <Badge variant="success">Actif</Badge>
                )}
                {!m.dateSortie && (
                  <form action={marquerSortantMembreCAAction}>
                    <input type="hidden" name="membreId" value={m.id} />
                    <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                      Marquer sortant
                    </button>
                  </form>
                )}
                <form id={`supprimer-membre-${m.id}`} action={supprimerMembreCAAction}>
                  <input type="hidden" name="membreId" value={m.id} />
                </form>
                <ConfirmDialog
                  formId={`supprimer-membre-${m.id}`}
                  triggerLabel="Supprimer"
                  title="Supprimer ce membre ?"
                  description={`Retire définitivement ${m.prenom} ${m.nom} de la liste des membres du CA.`}
                  confirmLabel="Supprimer définitivement"
                />
              </div>
            </div>
          ))}
          {membres.length === 0 && <EmptyState message="Aucun membre du CA enregistré." />}
        </div>
      </Card>

      <Card>
        <CardTitle>Réunions CA / AG et PV</CardTitle>
        <form action={creerReunionAction} className="mt-3 grid gap-3 sm:grid-cols-4">
          <ChampSelect label="Type" name="type" id="type-reunion" required>
            <option value="CA">Conseil d&apos;administration</option>
            <option value="AG">Assemblée générale</option>
          </ChampSelect>
          <Champ label="Date" name="date" id="date-reunion" type="date" required />
          <Champ
            label="Ordre du jour"
            name="ordreDuJour"
            id="ordre-du-jour-reunion"
            className="sm:col-span-2"
            placeholder="Optionnel"
          />
          <div className="flex justify-end sm:col-span-4">
            <Button type="submit" variant="primary">
              Créer la réunion
            </Button>
          </div>
        </form>

        <div className="mt-5 space-y-3">
          {reunions.map((r) => (
            <div key={r.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-ink">
                    {TYPE_REUNION_LABELS[r.type]} — {formatDate(r.date)}
                  </div>
                  {r.ordreDuJour && <div className="text-xs text-ink-faint">{r.ordreDuJour}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <form id={`supprimer-reunion-${r.id}`} action={supprimerReunionAction}>
                    <input type="hidden" name="reunionId" value={r.id} />
                  </form>
                  <ConfirmDialog
                    formId={`supprimer-reunion-${r.id}`}
                    triggerLabel="Supprimer"
                    title="Supprimer cette réunion ?"
                    description="Les documents déjà attachés (PV) sont conservés mais détachés de cette réunion."
                    confirmLabel="Supprimer définitivement"
                  />
                </div>
              </div>

              <div className="mt-2 space-y-1">
                {r.documents.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
                    <a
                      href={`/administration/gouvernance/documents/${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-pine hover:underline"
                    >
                      {d.nomFichier}
                    </a>
                    <form id={`supprimer-doc-${d.id}`} action={supprimerDocumentAssociationAction}>
                      <input type="hidden" name="documentId" value={d.id} />
                    </form>
                    <ConfirmDialog
                      formId={`supprimer-doc-${d.id}`}
                      triggerLabel="Retirer"
                      title="Retirer ce document ?"
                      description={`Supprime définitivement « ${d.nomFichier} ».`}
                      confirmLabel="Retirer définitivement"
                    />
                  </div>
                ))}
              </div>

              <form
                action={televerserDocumentAssociationAction}
                className="mt-2 flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="reunionId" value={r.id} />
                <input type="hidden" name="type" value="PV" />
                <input type="file" name="fichier" required className="text-xs" />
                <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Joindre le PV
                </button>
              </form>
            </div>
          ))}
          {reunions.length === 0 && <EmptyState message="Aucune réunion enregistrée." />}
        </div>
      </Card>

      <Card>
        <CardTitle>Règlement intérieur, statuts et autres documents de référence</CardTitle>
        <form
          action={televerserDocumentAssociationAction}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <ChampSelect label="Type" name="type" id="type-doc-reference" required>
            <option value="REGLEMENT_INTERIEUR">Règlement intérieur</option>
            <option value="STATUTS">Statuts</option>
            <option value="AUTRE">Autre</option>
          </ChampSelect>
          <div>
            <label htmlFor="fichier-doc-reference" className="mb-1 block text-sm font-medium text-ink">
              Fichier
            </label>
            <input id="fichier-doc-reference" type="file" name="fichier" required className="text-sm" />
          </div>
          <Button type="submit" variant="primary">
            Ajouter le document
          </Button>
        </form>

        <div className="mt-5 divide-y divide-border">
          {documentsReference.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <a
                  href={`/administration/gouvernance/documents/${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-pine hover:underline"
                >
                  {d.nomFichier}
                </a>
                <div className="text-xs text-ink-faint">
                  {TYPE_DOCUMENT_ASSOCIATION_LABELS[d.type]} · {formatDate(d.creeLe)}
                </div>
              </div>
              <form id={`supprimer-doc-ref-${d.id}`} action={supprimerDocumentAssociationAction}>
                <input type="hidden" name="documentId" value={d.id} />
              </form>
              <ConfirmDialog
                formId={`supprimer-doc-ref-${d.id}`}
                triggerLabel="Retirer"
                title="Retirer ce document ?"
                description={`Supprime définitivement « ${d.nomFichier} ».`}
                confirmLabel="Retirer définitivement"
              />
            </div>
          ))}
          {documentsReference.length === 0 && (
            <EmptyState message="Aucun règlement, statuts ou autre document de référence pour l'instant." />
          )}
        </div>
      </Card>
    </div>
  );
}
