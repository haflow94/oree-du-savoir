import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";

// Ce flux tourne sur une petite volumétrie associative : une limite basse
// suffit et évite qu'une réponse grossisse sans borne si n8n reste arrêté
// longtemps (voir CLAUDE.md — l'app doit fonctionner normalement sans n8n).
const LIMITE = 25;
const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

export type CandidatAlerteCheque = {
  chequeId: string;
  numeroAlerte: number;
  banque: string | null;
  numero: string | null;
  montant: string;
  etudiantNom: string;
  etudiantPrenom: string;
  datePaiement: string;
};

// Chèques reçus (Cheque.statut = RECU) mais pas encore déposés en banque,
// au-delà du délai configuré (ParametresRelance.delaiJoursCheque,
// Administration → Relances). Alerte interne au Bureau — destinée aux
// comptes actifs de rôle BUREAU, jamais à la famille (flux distinct de
// dossiers-a-relancer, voir CLAUDE.md et la mémoire projet : ce sont deux
// règles métier différentes, volontairement pas couplées).
export async function GET(request: NextRequest) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const parametres = await prisma.parametresRelance.findFirst();
  if (!parametres) return NextResponse.json({ destinataires: [], candidats: [] });

  const bureau = await prisma.utilisateur.findMany({
    where: { role: "BUREAU", actif: true },
    select: { email: true },
  });
  const destinataires = bureau.map((u) => u.email);
  if (destinataires.length === 0) {
    return NextResponse.json({ destinataires: [], candidats: [] });
  }

  const cheques = await prisma.cheque.findMany({
    where: {
      statut: "RECU",
      nombreAlertesEnvoyees: { lt: parametres.nombreMaxAlertesCheque },
      paiement: {
        echeance: {
          dossierAnnuel: {
            anneeScolaire: { archivee: false },
            etudiant: { anonymiseLe: null },
          },
        },
      },
    },
    select: {
      id: true,
      banque: true,
      numero: true,
      nombreAlertesEnvoyees: true,
      derniereAlerteEnvoyeeLe: true,
      paiement: {
        select: {
          montant: true,
          datePaiement: true,
          echeance: {
            select: {
              dossierAnnuel: {
                select: { etudiant: { select: { nom: true, prenom: true } } },
              },
            },
          },
        },
      },
    },
    orderBy: { paiement: { datePaiement: "asc" } },
    take: LIMITE,
  });

  const maintenant = Date.now();
  const candidats: CandidatAlerteCheque[] = [];
  for (const cheque of cheques) {
    const derniereAction = cheque.derniereAlerteEnvoyeeLe ?? cheque.paiement.datePaiement;
    const joursEcoules = (maintenant - derniereAction.getTime()) / MS_PAR_JOUR;
    if (joursEcoules < parametres.delaiJoursCheque) continue;

    const etudiant = cheque.paiement.echeance.dossierAnnuel.etudiant;
    candidats.push({
      chequeId: cheque.id,
      numeroAlerte: cheque.nombreAlertesEnvoyees + 1,
      banque: cheque.banque,
      numero: cheque.numero,
      montant: cheque.paiement.montant.toString(),
      etudiantNom: etudiant.nom,
      etudiantPrenom: etudiant.prenom,
      datePaiement: cheque.paiement.datePaiement.toISOString(),
    });
  }

  return NextResponse.json({ destinataires: candidats.length > 0 ? destinataires : [], candidats });
}
