import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";
import { dossierDocumentaireComplet } from "@/lib/documents-statut";

// Ce flux tourne sur une petite volumétrie associative : une limite basse
// suffit et évite qu'une réponse grossisse sans borne si n8n reste arrêté
// longtemps (voir CLAUDE.md — l'app doit fonctionner normalement sans n8n).
const LIMITE = 25;

export type CandidatNotification = {
  etudiantId: string;
  nom: string;
  prenom: string;
  destinataireEmail: string;
  destinatairePrenom: string;
  documentId: string;
  nomFichier: string;
};

// Étudiants validés dont le dossier a déjà été signé mais pas encore
// notifiés (voir Etudiant.notificationBienvenueEnvoyeeLe) : source unique de
// vérité pour l'idempotence du flux 1 (email de bienvenue). n8n ne lit
// jamais Postgres directement — uniquement via cette route, qui revérifie
// elle-même statutInscription/signature/dossier documentaire avant de rendre
// un candidat (voir le verrou de sécurité fonctionnelle plus bas).
export async function GET(request: NextRequest) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const etudiants = await prisma.etudiant.findMany({
    where: {
      statutInscription: "VALIDE",
      notificationBienvenueEnvoyeeLe: null,
      documents: { some: { type: "DOSSIER_SIGNE" } },
      anonymiseLe: null,
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      email: true,
      statutInscription: true,
      documents: {
        select: { id: true, type: true, nomFichier: true, dateExpiration: true, creeLe: true },
      },
      // Statut de signature Documenso par dossier annuel (voir
      // prisma/schema.prisma#StatutSignature) — vérifié ci-dessous en plus du
      // filtre déjà posé dans le `where`, voir le verrou de sécurité
      // fonctionnelle juste en dessous.
      dossiersAnnuels: { select: { statutSignature: true } },
      responsables: {
        where: { email: { not: null } },
        orderBy: { creeLe: "asc" },
        take: 1,
        select: { email: true, prenom: true },
      },
    },
    orderBy: { misAJourLe: "asc" },
    take: LIMITE,
  });

  const candidats: CandidatNotification[] = [];
  for (const etudiant of etudiants) {
    // Verrou de sécurité fonctionnelle redondant (Flux 1 — voir CLAUDE.md) :
    // un email de bienvenue ne doit jamais partir tant que la validation
    // n'est pas *réellement* complète. validerInscriptionAction
    // ((app)/etudiants/[id]/actions.ts) bloque déjà la validation elle-même
    // sur un dossier documentaire incomplet, mais cette route est le seul
    // point que n8n consulte pour déclencher l'envoi : elle revérifie donc
    // elle-même, indépendamment de tout autre chemin possible de
    // création/modification d'un Etudiant/DossierAnnuel, que statutInscription
    // est bien VALIDE, qu'au moins un DossierAnnuel est réellement SIGNEE
    // (statut posé uniquement par le webhook Documenso, jamais par l'app —
    // voir api/webhooks/documenso/route.ts) et que le dossier documentaire
    // (le dossier signé — voir TYPES_DOCUMENTS_REQUIS) est complet. Un candidat qui
    // échoue à ce contrôle est simplement exclu, jamais remonté en erreur :
    // rien à notifier tant que ces conditions ne sont pas réunies.
    const dossierReellementSigne = etudiant.dossiersAnnuels.some(
      (d) => d.statutSignature === "SIGNEE",
    );
    if (
      etudiant.statutInscription !== "VALIDE" ||
      !dossierReellementSigne ||
      !dossierDocumentaireComplet(etudiant.documents)
    ) {
      continue;
    }

    // Le dossier réellement SIGNÉ (jamais DOSSIER_GENERE, le formulaire
    // pré-signature) : c'est ce que la famille attend en pièce jointe de
    // l'email de bienvenue, pas le brouillon envoyé à Documenso.
    const document = etudiant.documents
      .filter((d) => d.type === "DOSSIER_SIGNE")
      .sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime())[0];
    const responsable = etudiant.responsables[0];
    // Destinataire : le responsable légal en priorité (cas Jeunes), sinon
    // l'étudiant lui-même (cas Adultes, sans responsable saisi). Un candidat
    // sans aucun email exploitable ou sans dossier signé est simplement
    // exclu ici plutôt que remonté en erreur : rien à notifier tant que ces
    // données ne sont pas là, le staff les complète depuis la fiche.
    const destinataireEmail = responsable?.email ?? etudiant.email;
    if (!document || !destinataireEmail) continue;

    candidats.push({
      etudiantId: etudiant.id,
      nom: etudiant.nom,
      prenom: etudiant.prenom,
      destinataireEmail,
      destinatairePrenom: responsable?.prenom ?? etudiant.prenom,
      documentId: document.id,
      nomFichier: document.nomFichier,
    });
  }

  return NextResponse.json({ candidats });
}
