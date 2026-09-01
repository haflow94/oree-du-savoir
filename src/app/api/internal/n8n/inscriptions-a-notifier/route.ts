import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";

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

// Étudiants validés dont le dossier a déjà été généré mais pas encore
// notifiés (voir Etudiant.notificationBienvenueEnvoyeeLe) : source unique de
// vérité pour l'idempotence du flux 1 (email de bienvenue). n8n ne lit
// jamais Postgres directement — uniquement via cette route.
export async function GET(request: NextRequest) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const etudiants = await prisma.etudiant.findMany({
    where: {
      statutInscription: "VALIDE",
      notificationBienvenueEnvoyeeLe: null,
      documents: { some: { type: "DOSSIER_GENERE" } },
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      email: true,
      documents: {
        where: { type: "DOSSIER_GENERE" },
        orderBy: { creeLe: "desc" },
        take: 1,
        select: { id: true, nomFichier: true },
      },
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
    const document = etudiant.documents[0];
    const responsable = etudiant.responsables[0];
    // Destinataire : le responsable légal en priorité (cas Jeunes), sinon
    // l'étudiant lui-même (cas Adultes, sans responsable saisi). Un candidat
    // sans aucun email exploitable ou sans dossier généré est simplement
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
