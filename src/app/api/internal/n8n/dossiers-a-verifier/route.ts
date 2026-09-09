import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";
import { creerAccesDossier } from "@/lib/acces-dossier";

// Ce flux tourne sur une petite volumétrie associative : une limite basse
// suffit et évite qu'une réponse grossisse sans borne si n8n reste arrêté
// longtemps (voir CLAUDE.md — l'app doit fonctionner normalement sans n8n).
const LIMITE = 25;

export type CandidatDossierAVerifier = {
  dossierAnnuelId: string;
  etudiantId: string;
  nom: string;
  prenom: string;
  destinataireEmail: string;
  destinatairePrenom: string;
  lien: string;
};

// Dossiers annuels dont le PDF (V1 ou une version corrigée) est prêt et pas
// encore signalé à la famille (voir DossierAnnuel.notificationVerificationEnvoyeeLe,
// même patron d'idempotence que GET .../preinscriptions-a-notifier). Distinct
// de ce dernier : celui-ci notifie la FAMILLE que son dossier est prêt à
// vérifier, celui-ci n'alerte jamais le staff — deux flux indépendants.
//
// Le lien sécurisé (AccesDossier) est créé ICI, à la lecture, jamais avant
// (voir preinscription/actions.ts) : le token brut n'est jamais relisible
// une fois généré (seul son hash est stocké), il doit donc être produit au
// moment où il sert réellement — juste avant de figurer dans l'email que
// n8n s'apprête à envoyer. Un appel GET répété avant le POST .../notifie
// correspondant régénère le lien (l'ancien devient invalide) : sans
// conséquence tant que seul le dernier lien effectivement envoyé compte.
export async function GET(request: NextRequest) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const dossiers = await prisma.dossierAnnuel.findMany({
    where: {
      statutSignature: "A_VERIFIER",
      notificationVerificationEnvoyeeLe: null,
      etudiant: { anonymiseLe: null },
    },
    include: {
      etudiant: {
        include: { responsables: { orderBy: { creeLe: "asc" }, take: 1 } },
      },
    },
    orderBy: { creeLe: "asc" },
    take: LIMITE,
  });

  // PREINSCRIPTION_PUBLIC_HOSTNAME (jamais PUBLIC_HOST) : ce lien part par
  // e-mail à la FAMILLE, qui n'est ni sur le LAN ni sur le tailnet de
  // l'association — seul le hostname du tunnel Cloudflare public est
  // réellement joignable pour elle. /dossier/* est servi par ce même tunnel
  // (voir CLAUDE.md, proxy.ts#cheminAutoriseSurHotePublicPreinscription) et
  // toujours en HTTPS, même pattern que (app)/inscriptions/page.tsx pour le
  // QR d'inscription publique. PUBLIC_HOST reste réservé aux liens internes
  // au staff (QR de salle/classe, voir .../preinscriptions-a-notifier).
  const base = process.env.PREINSCRIPTION_PUBLIC_HOSTNAME
    ? `https://${process.env.PREINSCRIPTION_PUBLIC_HOSTNAME}`
    : "";

  const candidats: CandidatDossierAVerifier[] = [];
  for (const dossier of dossiers) {
    const responsable = dossier.etudiant.responsables[0];
    const destinataireEmail = dossier.etudiant.email ?? responsable?.email;
    if (!destinataireEmail) continue; // rien à envoyer : reste candidat au prochain appel, à traiter à la main entre-temps

    const { token } = await creerAccesDossier(dossier.id);
    candidats.push({
      dossierAnnuelId: dossier.id,
      etudiantId: dossier.etudiant.id,
      nom: dossier.etudiant.nom,
      prenom: dossier.etudiant.prenom,
      destinataireEmail,
      destinatairePrenom: responsable?.prenom ?? dossier.etudiant.prenom,
      lien: `${base}/dossier/${token}`,
    });
  }

  return NextResponse.json({ candidats });
}
