import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, ROLES_STAFF } from "@/lib/roles";
import { LONGUEUR_MIN_MOT_DE_PASSE } from "@/lib/comptes";
import { BackLink } from "@/components/ui/back-link";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { NouveauCompteDialog } from "../nouveau-compte-dialog";
import { UtilisateurRow } from "../utilisateur-row";

const FROM = "/administration/enseignants";

const MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Tous les champs obligatoires doivent être renseignés.",
  MOT_DE_PASSE_TROP_COURT: `Le mot de passe doit faire au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`,
  EMAIL_DEJA_UTILISE: "Un compte utilise déjà cette adresse email.",
  EMAIL_INVALIDE: "Cet email n'a pas un format valide.",
  INTROUVABLE: "Ce compte n'existe plus.",
};

export default async function EnseignantsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; utilisateurId?: string }>;
}) {
  await requireRole([Role.BUREAU]);
  const { error, ok, utilisateurId } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const [enseignants, sections] = await Promise.all([
    prisma.utilisateur.findMany({
      where: { role: Role.ENSEIGNANT },
      orderBy: [{ actif: "desc" }, { nom: "asc" }],
      include: {
        _count: { select: { sessions: true, classesEnseignees: true } },
        specialites: { select: { id: true } },
      },
    }),
    prisma.section.findMany({ orderBy: { nom: "asc" }, select: { id: true, nom: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <BackLink href="/administration" label="Administration" />
          <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">Enseignants</h1>
          <p className="text-sm text-ink-muted">
            Comptes enseignants, séparés du staff (Bureau, Administration,
            Accueil, Trésorier) géré depuis Administration → Comptes.
          </p>
        </div>
        <NouveauCompteDialog
          ouvrirAuChargement={!!error && !utilisateurId}
          from={FROM}
          roleFixe={Role.ENSEIGNANT}
          titre="Créer un compte enseignant"
          triggerLabel="+ Nouveau compte enseignant"
          sectionsDisponibles={sections}
        />
      </div>

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      {enseignants.length === 0 ? (
        <EmptyState message="Aucun compte enseignant pour l'instant." />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-card">
          {enseignants.map((u) => (
            <UtilisateurRow
              key={u.id}
              utilisateur={{
                id: u.id,
                prenom: u.prenom,
                nom: u.nom,
                email: u.email,
                role: u.role,
                actif: u.actif,
                dernierLogin: u.dernierLogin,
                sessionsActives: u._count.sessions,
              }}
              ouvrirAuChargement={!!error && utilisateurId === u.id}
              from={FROM}
              infoExtra={`${u._count.classesEnseignees} classe(s)`}
              roleOptions={ROLES_STAFF}
              rolePlaceholder="Faire passer vers le staff…"
              sectionsDisponibles={sections}
              specialiteIds={u.specialites.map((s) => s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
