import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { buttonVariants } from "@/components/ui/button";
import { BackLink } from "@/components/ui/back-link";
import { TableWrap, TableHead } from "@/components/ui/table";

const PAR_PAGE = 50;

const ACTION_LABELS: Record<string, string> = {
  connexion: "Connexion",
  deconnexion: "Déconnexion",
  creation: "Création",
  creation_compte: "Création de compte",
  activation_compte: "Activation de compte",
  desactivation_compte: "Désactivation de compte",
  changement_role: "Changement de rôle",
  changement_specialites: "Modification des spécialités",
  reinitialisation_mot_de_passe: "Réinitialisation de mot de passe",
  revocation_sessions: "Révocation des sessions",
  saisie_paiement: "Saisie d'un paiement",
  validation_presence: "Validation de présence",
  correction_presence: "Correction de présence",
  creation_section: "Création de section",
  modification_section: "Modification de section",
  suppression_section: "Suppression de section",
  creation_annee_scolaire: "Création d'année scolaire",
  modification_annee_scolaire: "Modification d'année scolaire",
  activation_annee_scolaire: "Activation d'année scolaire",
  modification_etudiant: "Modification de fiche étudiant",
  ajout_responsable: "Ajout d'un responsable légal",
  modification_responsable: "Modification d'un responsable légal",
  suppression_responsable: "Suppression d'un responsable légal",
  modification_cours: "Modification de cours",
  suppression_cours: "Suppression de cours",
  modification_classe: "Modification de classe",
  duplication_classes: "Duplication des classes vers une nouvelle année",
  suppression_classe: "Suppression de classe",
  modification_fermeture: "Modification d'une fermeture",
  suppression_fermeture: "Suppression d'une fermeture",
  modification_montant_du: "Modification du montant dû",
  modification_paiement: "Modification d'un paiement",
  modification_mouvement: "Modification d'un mouvement de trésorerie",
  suppression_mouvement: "Suppression d'un mouvement de trésorerie",
  validation_inscription: "Validation d'une inscription",
  televersement_document: "Téléversement d'un document",
  suppression_document: "Suppression d'un document",
  suppression_etudiant: "Suppression d'une fiche étudiant",
  anonymisation_etudiant: "Anonymisation d'une fiche étudiant (RGPD)",
  modification_echeance: "Modification d'une échéance",
  suppression_echeance: "Suppression d'une échéance",
};

export default async function JournalAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole([Role.BUREAU]);
  const { page } = await searchParams;

  const pageCourante = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);

  const [entrees, total] = await Promise.all([
    prisma.journalAudit.findMany({
      orderBy: { horodatage: "desc" },
      skip: (pageCourante - 1) * PAR_PAGE,
      take: PAR_PAGE,
      include: { utilisateur: true },
    }),
    prisma.journalAudit.count(),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAR_PAGE));

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/administration" label="Administration" />
        <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">
          Journal d&apos;audit
        </h1>
        <p className="text-sm text-ink-muted">
          {total} entrée(s). Traçabilité des actions sensibles : comptes,
          paiements, présences.
        </p>
      </div>

      <TableWrap>
        <TableHead>
          <th className="px-4 py-3">Date</th>
          <th className="px-4 py-3">Auteur</th>
          <th className="px-4 py-3">Action</th>
          <th className="px-4 py-3">Entité</th>
          <th className="px-4 py-3">Détails</th>
        </TableHead>
        <tbody className="divide-y divide-border">
          {entrees.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                {new Date(e.horodatage).toLocaleString("fr-FR")}
              </td>
              <td className="px-4 py-3 text-ink-muted">
                {e.utilisateur
                  ? `${e.utilisateur.prenom} ${e.utilisateur.nom}`
                  : "—"}
              </td>
              <td className="px-4 py-3 font-medium text-ink">
                {ACTION_LABELS[e.action] ?? e.action}
              </td>
              <td className="px-4 py-3 text-ink-muted">{e.entite}</td>
              <td className="px-4 py-3 text-xs text-ink-muted">
                {e.details ? JSON.stringify(e.details) : "—"}
              </td>
            </tr>
          ))}
          {entrees.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-ink-faint">
                Aucune entrée pour l&apos;instant.
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {pageCourante > 1 ? (
            <Link
              href={`/administration/journal?page=${pageCourante - 1}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              ← Précédent
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-muted">
            Page {pageCourante} sur {pages}
          </span>
          {pageCourante < pages ? (
            <Link
              href={`/administration/journal?page=${pageCourante + 1}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Suivant →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
