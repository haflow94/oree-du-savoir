import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";

// Ce flux tourne sur une petite volumétrie associative : une limite basse
// suffit et évite qu'une réponse grossisse sans borne si n8n reste arrêté
// longtemps (voir CLAUDE.md — l'app doit fonctionner normalement sans n8n).
const LIMITE = 25;

export type CandidatNotificationPreinscription = {
  notificationId: string;
  etudiantId: string;
  nom: string;
  prenom: string;
  creeLe: string;
  lien: string;
};

// Notifications de nouvelle préinscription pas encore envoyées par e-mail à
// un responsable (voir NotificationPreinscription.notifieParEmailLe,
// prisma/schema.prisma) : source unique de vérité pour l'idempotence de ce
// flux, même patron que GET .../inscriptions-a-notifier. Distinct de ce
// dernier : celui-ci notifie la FAMILLE par e-mail une fois son dossier
// validé, celui-ci alerte le STAFF dès l'arrivée d'une nouvelle
// préinscription — deux flux indépendants, aucun lien entre les deux. n8n
// ne lit jamais Postgres directement — uniquement via cette route.
export async function GET(request: NextRequest) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const notifications = await prisma.notificationPreinscription.findMany({
    where: { notifieParEmailLe: null },
    select: {
      id: true,
      creeLe: true,
      etudiant: { select: { id: true, nom: true, prenom: true } },
    },
    orderBy: { creeLe: "asc" },
    take: LIMITE,
  });

  // PUBLIC_HOST = adresse LAN réellement joignable par le staff (voir
  // .env.example, déjà utilisée pour le même besoin par
  // (app)/inscriptions/page.tsx) : cette route est appelée par n8n hors de
  // toute requête navigateur, donc sans en-tête Host fiable représentant ce
  // que le staff verrait dans son propre navigateur — seule cette variable
  // explicite permet de construire un lien correct dans l'e-mail. Vide par
  // défaut (non configurée) : le lien reste alors relatif, moins pratique
  // dans un e-mail mais jamais bloquant.
  const base = process.env.PUBLIC_HOST ? `http://${process.env.PUBLIC_HOST}` : "";

  const candidats: CandidatNotificationPreinscription[] = notifications.map((n) => ({
    notificationId: n.id,
    etudiantId: n.etudiant.id,
    nom: n.etudiant.nom,
    prenom: n.etudiant.prenom,
    creeLe: n.creeLe.toISOString(),
    lien: `${base}/etudiants/${n.etudiant.id}`,
  }));

  return NextResponse.json({ candidats });
}
