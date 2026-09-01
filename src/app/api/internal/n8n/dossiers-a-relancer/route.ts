import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";

// Ce flux tourne sur une petite volumétrie associative : une limite basse
// suffit et évite qu'une réponse grossisse sans borne si n8n reste arrêté
// longtemps (voir CLAUDE.md — l'app doit fonctionner normalement sans n8n).
const LIMITE = 25;
const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

export type MotifRelance = "PAIEMENT" | "PIECE_IDENTITE";

export type CandidatRelance = {
  dossierAnnuelId: string;
  etudiantId: string;
  nom: string;
  prenom: string;
  destinataireEmail: string;
  destinatairePrenom: string;
  numeroRelance: number;
  motifs: MotifRelance[];
};

// Dossiers annuels à relancer : aucun paiement du tout apporté (tous moyens
// confondus, quel que soit son état de traitement) et/ou pièce d'identité
// manquante sur l'étudiant, au-delà du délai configuré (voir
// ParametresRelance, Administration → Relances) depuis la création du
// dossier ou la dernière relance. n8n indique ensuite le numéro de relance
// envoyé via POST /api/internal/n8n/dossiers-annuels/[id]/relance-envoyee.
//
// Volontairement pas basé sur le statut Soldé/Partiel/Impayé (voir
// lib/paiements.ts#statutCotisation) : ce statut reflète l'encaissement réel
// en trésorerie (un chèque juste "reçu" mais pas encore "déposé"/"encaissé"
// compte déjà dedans), pas ce que la famille a effectivement apporté. Un
// paiement partiel (un seul chèque apporté sur plusieurs prévus) n'est
// jamais relancé automatiquement non plus : rien en base ne distingue un
// oubli d'un arrangement passé avec le Bureau — au staff de trancher au cas
// par cas depuis la fiche.
export async function GET(request: NextRequest) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const parametres = await prisma.parametresRelance.findFirst();
  if (!parametres) return NextResponse.json({ candidats: [] });

  const dossiers = await prisma.dossierAnnuel.findMany({
    where: {
      rembourse: false,
      montantDu: { gt: 0 },
      nombreRelancesEnvoyees: { lt: parametres.nombreMaxRelances },
      anneeScolaire: { archivee: false },
      etudiant: { anonymiseLe: null },
    },
    select: {
      id: true,
      creeLe: true,
      derniereRelanceEnvoyeeLe: true,
      nombreRelancesEnvoyees: true,
      echeances: { select: { paiements: { select: { id: true }, take: 1 } } },
      etudiant: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          email: true,
          documents: {
            where: { type: "PIECE_IDENTITE" },
            select: { id: true },
            take: 1,
          },
          responsables: {
            where: { email: { not: null } },
            orderBy: { creeLe: "asc" },
            take: 1,
            select: { email: true, prenom: true },
          },
        },
      },
    },
    orderBy: { creeLe: "asc" },
    take: LIMITE,
  });

  const maintenant = Date.now();
  const candidats: CandidatRelance[] = [];
  for (const dossier of dossiers) {
    const derniereAction = dossier.derniereRelanceEnvoyeeLe ?? dossier.creeLe;
    const joursEcoules = (maintenant - derniereAction.getTime()) / MS_PAR_JOUR;
    if (joursEcoules < parametres.delaiJours) continue;

    const aucunPaiement = dossier.echeances.every((e) => e.paiements.length === 0);
    const pieceIdentiteManquante = dossier.etudiant.documents.length === 0;
    if (!aucunPaiement && !pieceIdentiteManquante) continue;

    const responsable = dossier.etudiant.responsables[0];
    const destinataireEmail = responsable?.email ?? dossier.etudiant.email;
    if (!destinataireEmail) continue;

    const motifs: MotifRelance[] = [];
    if (aucunPaiement) motifs.push("PAIEMENT");
    if (pieceIdentiteManquante) motifs.push("PIECE_IDENTITE");

    candidats.push({
      dossierAnnuelId: dossier.id,
      etudiantId: dossier.etudiant.id,
      nom: dossier.etudiant.nom,
      prenom: dossier.etudiant.prenom,
      destinataireEmail,
      destinatairePrenom: responsable?.prenom ?? dossier.etudiant.prenom,
      numeroRelance: dossier.nombreRelancesEnvoyees + 1,
      motifs,
    });
  }

  return NextResponse.json({ candidats });
}
