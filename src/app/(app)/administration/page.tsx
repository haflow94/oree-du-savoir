import Link from "next/link";
import { Settings } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Role, ROLES_STAFF } from "@/lib/roles";
import { requireModule, peutAccederModule, Module } from "@/lib/permissions";
import { LONGUEUR_MIN_MOT_DE_PASSE } from "@/lib/comptes";
import { etudiantsEligiblesAnonymisation } from "@/lib/rgpd-eligibles";
import { buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { IconChip } from "@/components/ui/icon-chip";
import { Badge } from "@/components/ui/badge";
import { NouveauCompteDialog } from "./nouveau-compte-dialog";
import { UtilisateurRow } from "./utilisateur-row";

const MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Tous les champs obligatoires doivent être renseignés.",
  MOT_DE_PASSE_TROP_COURT: `Le mot de passe doit faire au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`,
  EMAIL_DEJA_UTILISE: "Un compte utilise déjà cette adresse email.",
  EMAIL_INVALIDE: "Cet email n'a pas un format valide.",
  INTROUVABLE: "Ce compte n'existe plus.",
  AUTO_DESACTIVATION: "Vous ne pouvez pas désactiver votre propre compte.",
  DERNIER_BUREAU:
    "Impossible : ce compte est le dernier Bureau actif. Sans lui, plus personne ne pourrait gérer les comptes.",
};

export default async function AdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; utilisateurId?: string }>;
}) {
  // Double vérification : le lien est déjà masqué pour les autres rôles
  // dans la barre latérale, mais l'accès direct à l'URL doit aussi être
  // bloqué ici (défense en profondeur).
  const session = await requireModule(Module.ADMINISTRATION, "LECTURE");
  const estBureau = session.role === Role.BUREAU;
  const peutAccederGouvernance = await peutAccederModule(session.role, Module.GOUVERNANCE, "LECTURE");
  const { error, ok, utilisateurId } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  // Les enseignants ont leur propre onglet (Administration > Enseignants) :
  // exclus ici pour ne pas mélanger les deux populations de comptes.
  const [utilisateurs, dossiersRgpdEligibles] = await Promise.all([
    estBureau
      ? prisma.utilisateur.findMany({
          where: { role: { in: ROLES_STAFF } },
          orderBy: [{ actif: "desc" }, { nom: "asc" }],
          include: { _count: { select: { sessions: true } } },
        })
      : Promise.resolve([]),
    estBureau ? etudiantsEligiblesAnonymisation() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconChip icon={Settings} accent="sky" />
          <div>
            <h1 className="font-display text-3xl font-semibold text-pine-strong">Administration</h1>
            <p className="text-sm text-ink-muted">
              {estBureau
                ? "Comptes, rôles, activation et révocation."
                : "Référentiels : sections, salles, année scolaire."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/administration/organisation" className={buttonVariants({ variant: "secondary" })}>
            Organisation
          </Link>
          <Link href="/administration/sections" className={buttonVariants({ variant: "secondary" })}>
            Sections
          </Link>
          <Link href="/administration/salles" className={buttonVariants({ variant: "secondary" })}>
            Salles
          </Link>
          <Link
            href="/administration/annees-scolaires"
            className={buttonVariants({ variant: "secondary" })}
          >
            Année scolaire
          </Link>
          {estBureau && (
            <Link
              href="/administration/enseignants"
              className={buttonVariants({ variant: "secondary" })}
            >
              Enseignants
            </Link>
          )}
          {estBureau && (
            <Link
              href="/administration/activites"
              className={buttonVariants({ variant: "secondary" })}
            >
              Responsables activités
            </Link>
          )}
          {estBureau && (
            <Link href="/administration/journal" className={buttonVariants({ variant: "secondary" })}>
              Journal d&apos;audit
            </Link>
          )}
          {peutAccederGouvernance && (
            <Link href="/administration/gouvernance" className={buttonVariants({ variant: "secondary" })}>
              Gouvernance (CA/AG)
            </Link>
          )}
          {estBureau && (
            <Link
              href="/administration/permissions"
              className={buttonVariants({ variant: "secondary" })}
            >
              Permissions
            </Link>
          )}
          {estBureau && (
            <Link
              href="/administration/rgpd"
              className={buttonVariants({ variant: "secondary", className: "gap-2" })}
            >
              RGPD
              {dossiersRgpdEligibles.length > 0 && (
                <Badge variant="warning">{dossiersRgpdEligibles.length}</Badge>
              )}
            </Link>
          )}
          {estBureau && (
            <NouveauCompteDialog ouvrirAuChargement={!!error && !utilisateurId} />
          )}
        </div>
      </div>

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      {estBureau && (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-card">
          {utilisateurs.map((u) => (
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
              soiMeme={u.id === session.id}
              ouvrirAuChargement={!!error && utilisateurId === u.id}
            />
          ))}
          {utilisateurs.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-ink-faint">Aucun compte pour l&apos;instant.</p>
          )}
        </div>
      )}
    </div>
  );
}
