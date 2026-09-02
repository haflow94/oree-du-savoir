import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierAuthN8n } from "@/lib/auth-n8n";
import {
  aujourdhuiUTC,
  ajouterJoursUTC,
  debutAnneeScolaireCalendaireUTC,
  debutMoisUTC,
  finMoisUTC,
} from "@/lib/calendrier";

export type RapportAEnvoyer = {
  aEnvoyer: boolean;
  destinataires: string[];
  cadence?: "HEBDOMADAIRE" | "MENSUELLE";
  periodeDebut?: string;
  periodeFin?: string;
  effectifs?: {
    nbEtudiantsValides: number;
    nbNouvellesFichesPeriode: number;
    nbDoublonsEnAttente: number;
  };
  tresorerie?: {
    soldeActuel: string;
    entreesPeriode: string;
    sortiesPeriode: string;
  };
};

const AUCUN_ENVOI: RapportAEnvoyer = { aEnvoyer: false, destinataires: [] };

// Rapport hebdomadaire/mensuel effectifs + trésorerie au Bureau (hors app,
// via n8n) — cadence pilotée par ParametresRelance.dureeIntensiveRapportSemaines
// (Administration → Relances) : hebdomadaire (lundi) pendant les N premières
// semaines suivant le 1er septembre calendaire (voir debutAnneeScolaireCalendaireUTC),
// puis mensuelle (le dernier jour du mois) au-delà — y compris pendant les
// vacances d'été, où des inscriptions continuent d'arriver. Ancré sur le
// calendrier plutôt que sur AnneeScolaire.dateDebut (date pédagogique,
// éditable, souvent fin septembre/octobre) car le rythme des inscriptions
// démarre avant la rentrée effective des classes. N'écrit jamais "déjà
// envoyé" en base : le jour d'envoi est recalculé à chaque appel depuis la
// date du jour — un déclenchement manuel répété le même jour renverrait le
// même rapport une seconde fois (angle mort assumé, pas de verrou pour un
// rapport interne).
export async function GET(request: NextRequest) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const [anneeActive, parametres] = await Promise.all([
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
    prisma.parametresRelance.findFirst(),
  ]);
  if (!anneeActive || !parametres) return NextResponse.json(AUCUN_ENVOI);

  const aujourdhui = aujourdhuiUTC();
  const finPeriodeIntensive = ajouterJoursUTC(
    debutAnneeScolaireCalendaireUTC(aujourdhui),
    parametres.dureeIntensiveRapportSemaines * 7,
  );
  const enPeriodeIntensive = aujourdhui.getTime() < finPeriodeIntensive.getTime();

  const cadence: "HEBDOMADAIRE" | "MENSUELLE" = enPeriodeIntensive ? "HEBDOMADAIRE" : "MENSUELLE";
  const jourEnvoi = enPeriodeIntensive
    ? aujourdhui.getUTCDay() === 1 // lundi
    : aujourdhui.getTime() === finMoisUTC(aujourdhui).getTime();
  if (!jourEnvoi) return NextResponse.json(AUCUN_ENVOI);

  const bureau = await prisma.utilisateur.findMany({
    where: { role: "BUREAU", actif: true },
    select: { email: true },
  });
  const destinataires = bureau.map((u) => u.email);
  if (destinataires.length === 0) return NextResponse.json(AUCUN_ENVOI);

  const periodeDebut = enPeriodeIntensive ? ajouterJoursUTC(aujourdhui, -6) : debutMoisUTC(aujourdhui);
  const periodeFin = aujourdhui;

  const [
    nbEtudiantsValides,
    nbNouvellesFichesPeriode,
    nbDoublonsEnAttente,
    entrees,
    sorties,
    soldeEntrees,
    soldeSorties,
  ] = await Promise.all([
    prisma.etudiant.count({ where: { statutInscription: "VALIDE" } }),
    prisma.etudiant.count({ where: { creeLe: { gte: periodeDebut, lte: periodeFin } } }),
    prisma.etudiant.count({ where: { doublonPotentielId: { not: null } } }),
    prisma.mouvementTresorerie.aggregate({
      where: { type: "RECETTE", date: { gte: periodeDebut, lte: periodeFin } },
      _sum: { montant: true },
    }),
    prisma.mouvementTresorerie.aggregate({
      where: { type: "DEPENSE", date: { gte: periodeDebut, lte: periodeFin } },
      _sum: { montant: true },
    }),
    prisma.mouvementTresorerie.aggregate({
      where: { type: "RECETTE", date: { lte: periodeFin } },
      _sum: { montant: true },
    }),
    prisma.mouvementTresorerie.aggregate({
      where: { type: "DEPENSE", date: { lte: periodeFin } },
      _sum: { montant: true },
    }),
  ]);

  const montantSum = (agregat: { _sum: { montant: { toString(): string } | null } }) =>
    agregat._sum.montant ? Number.parseFloat(agregat._sum.montant.toString()) : 0;
  const soldeActuel = montantSum(soldeEntrees) - montantSum(soldeSorties);

  const rapport: RapportAEnvoyer = {
    aEnvoyer: true,
    destinataires,
    cadence,
    periodeDebut: periodeDebut.toISOString(),
    periodeFin: periodeFin.toISOString(),
    effectifs: { nbEtudiantsValides, nbNouvellesFichesPeriode, nbDoublonsEnAttente },
    tresorerie: {
      soldeActuel: soldeActuel.toFixed(2),
      entreesPeriode: montantSum(entrees).toFixed(2),
      sortiesPeriode: montantSum(sorties).toFixed(2),
    },
  };
  return NextResponse.json(rapport);
}
