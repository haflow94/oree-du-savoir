import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModule, peutAccederModule, Module } from "@/lib/permissions";
import { JOUR_LABELS } from "@/lib/planning";
import { promouvoirAffectationCohorteAction, retirerAffectationCohorteAction } from "../actions";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardTitle } from "@/components/ui/card";
import { ChampSelectAuto } from "@/components/ui/auto-submit";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const MESSAGES: Record<string, string> = {
  AFFECTATION_INTROUVABLE: "Cette affectation n'existe plus.",
  DEJA_AFFECTE: "Cet étudiant est déjà affecté à cette cohorte.",
  COHORTE_COMPLETE: "La cohorte est complète : impossible de promouvoir pour l'instant.",
};

// Capacité + liste d'attente d'une Cohorte, avec promotion manuelle — vit
// délibérément ici plutôt que sur la fiche d'une Classe (classes/[id]) : la
// capacité est une notion de bloc (Cohorte), pas d'une Classe individuelle.
export default async function CohorteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string; anneeScolaireId?: string }>;
}) {
  const session = await requireModule(Module.CLASSES, "LECTURE");
  const peutGerer = await peutAccederModule(session.role, Module.ETUDIANTS, "ECRITURE");
  const { id } = await params;
  const { error, ok, anneeScolaireId } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const cohorte = await prisma.cohorte.findUnique({
    where: { id },
    include: {
      section: { select: { id: true, nom: true } },
      coursLies: { include: { cours: { select: { id: true, nom: true } } }, orderBy: { ordre: "asc" } },
    },
  });
  if (!cohorte) notFound();

  const [annees, anneeActive] = await Promise.all([
    prisma.anneeScolaire.findMany({ orderBy: { libelle: "desc" } }),
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
  ]);
  const anneeSelectionneeId = anneeScolaireId || anneeActive?.id || annees[0]?.id || "";

  const [classesDuBloc, affectations] = anneeSelectionneeId
    ? await Promise.all([
        prisma.classe.findMany({
          where: { cohorteId: id, anneeScolaireId: anneeSelectionneeId },
          include: { cours: true },
          orderBy: { heureDebut: "asc" },
        }),
        prisma.affectationCohorte.findMany({
          where: { cohorteId: id, anneeScolaireId: anneeSelectionneeId },
          include: { etudiant: true },
          orderBy: [{ rangListeAttente: "asc" }, { creeLe: "asc" }],
        }),
      ])
    : [[], []];

  const affectes = affectations.filter((a) => a.statut === "AFFECTE");
  const enAttente = affectations.filter((a) => a.statut === "EN_ATTENTE");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <BackLink href="/classes" label="Classes" />
        <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">
          {cohorte.section.nom}
          {cohorte.niveau && ` — ${cohorte.niveau}`}
        </h1>
        <p className="text-sm text-ink-muted">
          {JOUR_LABELS[cohorte.jour]}
          {" · "}
          {cohorte.capaciteMax !== null
            ? `Capacité : ${affectes.length}/${cohorte.capaciteMax}`
            : "Capacité illimitée"}
        </p>
      </div>

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      <form action={`/classes/cohortes/${id}`} method="GET" className="max-w-xs">
        <ChampSelectAuto label="Année scolaire" name="anneeScolaireId" defaultValue={anneeSelectionneeId}>
          {annees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.libelle}
              {a.active ? " (active)" : ""}
            </option>
          ))}
        </ChampSelectAuto>
      </form>

      <Card>
        <CardTitle>Cours affectés à ce bloc</CardTitle>
        {cohorte.coursLies.length === 0 ? (
          <p className="mt-1 text-sm text-ink-faint">
            Aucun cours affecté pour l&apos;instant — affectez-en depuis{" "}
            <Link href="/classes" className="underline">
              Classes → Cohortes
            </Link>
            .
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">
            {cohorte.coursLies.map((cl) => cl.cours.nom).join(", ")}
          </p>
        )}
      </Card>

      {classesDuBloc.length === 0 ? (
        <Alert variant="warning">
          Aucune classe n&apos;existe encore pour ce bloc sur cette année : les
          étudiants ci-dessous sont affectés administrativement, mais pas
          encore inscrits à un cours concret. Créez les classes de ce bloc
          depuis <Link href="/classes/nouveau" className="underline">Nouvelle classe</Link>.
        </Alert>
      ) : (
        <Card>
          <CardTitle>Classes de ce bloc, {annees.find((a) => a.id === anneeSelectionneeId)?.libelle}</CardTitle>
          <ul className="mt-2 space-y-1 text-sm text-ink-muted">
            {classesDuBloc.map((c) => (
              <li key={c.id}>
                <Link href={`/classes/${c.id}`} className="hover:underline">
                  {c.cours.nom} — {c.heureDebut}–{c.heureFin}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle>Affectés ({affectes.length})</CardTitle>
        {affectes.length === 0 ? (
          <div className="mt-3">
            <EmptyState message="Aucun étudiant affecté sur cette année." />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {affectes.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2.5">
                <Link
                  href={`/etudiants/${a.etudiantId}`}
                  className="text-sm font-medium text-ink hover:underline"
                >
                  {a.etudiant.prenom} {a.etudiant.nom}
                </Link>
                {peutGerer && (
                  <form action={retirerAffectationCohorteAction}>
                    <input type="hidden" name="cohorteId" value={id} />
                    <input type="hidden" name="affectationId" value={a.id} />
                    <input type="hidden" name="anneeScolaireId" value={anneeSelectionneeId} />
                    <button type="submit" className="text-xs font-medium text-rust hover:underline">
                      Retirer
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Liste d&apos;attente ({enAttente.length})</CardTitle>
        <p className="mt-1 text-xs text-ink-faint">
          La promotion depuis la liste d&apos;attente est toujours manuelle :
          même quand une place se libère, personne n&apos;est ajouté
          automatiquement.
        </p>
        {enAttente.length === 0 ? (
          <div className="mt-3">
            <EmptyState message="Personne en liste d'attente." />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {enAttente.map((a, index) => (
              <li key={a.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2">
                  <Badge variant="neutral">#{index + 1}</Badge>
                  <Link
                    href={`/etudiants/${a.etudiantId}`}
                    className="text-sm font-medium text-ink hover:underline"
                  >
                    {a.etudiant.prenom} {a.etudiant.nom}
                  </Link>
                </div>
                {peutGerer && (
                  <div className="flex items-center gap-3">
                    <form id={`promouvoir-${a.id}`} action={promouvoirAffectationCohorteAction}>
                      <input type="hidden" name="cohorteId" value={id} />
                      <input type="hidden" name="affectationId" value={a.id} />
                      <input type="hidden" name="anneeScolaireId" value={anneeSelectionneeId} />
                    </form>
                    <ConfirmDialog
                      formId={`promouvoir-${a.id}`}
                      triggerLabel="Promouvoir"
                      title="Promouvoir cet étudiant ?"
                      description="Il sera inscrit dans toutes les classes de ce bloc pour cette année."
                      confirmLabel="Promouvoir"
                    />
                    <form action={retirerAffectationCohorteAction}>
                      <input type="hidden" name="cohorteId" value={id} />
                      <input type="hidden" name="affectationId" value={a.id} />
                      <input type="hidden" name="anneeScolaireId" value={anneeSelectionneeId} />
                      <button type="submit" className="text-xs font-medium text-rust hover:underline">
                        Retirer
                      </button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
