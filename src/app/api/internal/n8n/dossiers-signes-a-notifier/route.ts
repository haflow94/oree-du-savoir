import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";

// Ce flux tourne sur une petite volumétrie associative : une limite basse
// suffit et évite qu'une réponse grossisse sans borne si n8n reste arrêté
// longtemps (voir CLAUDE.md — l'app doit fonctionner normalement sans n8n).
const LIMITE = 25;

export type CandidatSignatureConfirmee = {
  dossierAnnuelId: string;
  etudiantId: string;
  nom: string;
  prenom: string;
  destinataireEmail: string;
  destinatairePrenom: string;
  documentId: string;
  nomFichier: string;
};

// Dossiers annuels dont la signature Documenso vient d'être confirmée
// (DossierAnnuel.statutSignature = SIGNEE, posé uniquement par le webhook
// api/webhooks/documenso — jamais par l'app elle-même) et pas encore
// signalés à la famille (voir DossierAnnuel.notificationSignatureEnvoyeeLe,
// même patron d'idempotence que notificationVerificationEnvoyeeLe sur
// GET .../dossiers-a-verifier). Flux distinct de celui-ci : "dossier prêt à
// vérifier" notifie AVANT la signature, celui-ci notifie juste APRÈS —
// indépendant aussi du flux "bienvenue" (.../inscriptions-a-notifier) qui
// attend en plus la validation administrative complète du dossier.
export async function GET(request: NextRequest) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const dossiers = await prisma.dossierAnnuel.findMany({
    where: {
      statutSignature: "SIGNEE",
      notificationSignatureEnvoyeeLe: null,
      etudiant: { anonymiseLe: null },
    },
    include: {
      etudiant: {
        include: { responsables: { orderBy: { creeLe: "asc" }, take: 1 } },
      },
      // Le PDF signé (type DOSSIER_SIGNE, créé par le webhook Documenso au
      // moment même où il pose statutSignature = SIGNEE) est rattaché à CE
      // dossier annuel précis via dossierAnnuelId, pas juste à l'étudiant :
      // évite toute ambiguïté pour un étudiant réinscrit sur plusieurs
      // années scolaires.
      documents: {
        where: { type: "DOSSIER_SIGNE" },
        orderBy: { creeLe: "desc" },
        take: 1,
      },
    },
    orderBy: { signeLe: "asc" },
    take: LIMITE,
  });

  const candidats: CandidatSignatureConfirmee[] = [];
  for (const dossier of dossiers) {
    const document = dossier.documents[0];
    const responsable = dossier.etudiant.responsables[0];
    const destinataireEmail = dossier.etudiant.email ?? responsable?.email;
    // Un candidat sans PDF signé retrouvé (webhook encore en train de le
    // télécharger, voir api/webhooks/documenso) ou sans email exploitable
    // est simplement exclu ici plutôt que remonté en erreur : reste
    // candidat au prochain appel, à traiter à la main entre-temps.
    if (!document || !destinataireEmail) continue;

    candidats.push({
      dossierAnnuelId: dossier.id,
      etudiantId: dossier.etudiant.id,
      nom: dossier.etudiant.nom,
      prenom: dossier.etudiant.prenom,
      destinataireEmail,
      destinatairePrenom: responsable?.prenom ?? dossier.etudiant.prenom,
      documentId: document.id,
      nomFichier: document.nomFichier,
    });
  }

  return NextResponse.json({ candidats });
}
