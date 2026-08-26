import "server-only";
import { prisma } from "@/lib/prisma";
import { aujourdhuiUTC } from "@/lib/presences";
import { anneeScolaireActiveId } from "@/lib/sections-etudiant";

export type SeanceDuJour =
  | { trouvee: true; classeId: string; seanceId: string }
  | { trouvee: false; raison: "TOKEN_INCONNU" | "PAS_DE_SEANCE" };

// Résout le token affiché en salle vers la séance du jour de la classe
// correspondante — utilisé à la fois par /qr/[token] (accès direct si déjà
// connecté) et par la connexion déclenchée depuis ce même QR (voir
// src/app/login/actions.ts), pour que la session créée soit restreinte à
// cette séance précise dès sa création.
export async function resoudreSeanceDuJourPourToken(
  token: string,
): Promise<SeanceDuJour> {
  const classe = await prisma.classe.findUnique({ where: { qrToken: token } });
  if (!classe) {
    return { trouvee: false, raison: "TOKEN_INCONNU" };
  }

  const seance = await prisma.seance.findUnique({
    where: { classeId_date: { classeId: classe.id, date: aujourdhuiUTC() } },
  });
  if (!seance) {
    return { trouvee: false, raison: "PAS_DE_SEANCE" };
  }

  return { trouvee: true, classeId: classe.id, seanceId: seance.id };
}

export type CandidatSeanceSalle = {
  seanceId: string;
  classeId: string;
  coursNom: string;
  niveau: string | null;
  heureDebut: string;
  heureFin: string;
  enseignants: string;
};

export type SeanceDuJourSalle =
  | { trouvee: true; classeId: string; seanceId: string }
  | { trouvee: false; raison: "SALLE_INCONNUE" }
  | { trouvee: false; raison: "PAS_DE_SEANCE" }
  | { trouvee: false; raison: "AMBIGU"; candidats: CandidatSeanceSalle[] };

// "HH:mm" en heure locale du serveur (même logique que aujourdhuiUTC : on
// veut l'heure que voit la personne en salle, pas celle du méridien de
// Greenwich). Comparable directement à Classe.heureDebut/heureFin, stockés
// au même format.
function heureActuelle(maintenant: Date = new Date()): string {
  const h = String(maintenant.getHours()).padStart(2, "0");
  const m = String(maintenant.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// Résout le QR affiché en salle (un seul code fixe par salle, jamais changé
// entre les cours qui s'y succèdent — contrainte physique de l'association :
// impossible d'imprimer/afficher un QR différent à chaque changement de
// classe) vers la séance du jour à faire maintenant. Plusieurs classes
// différentes peuvent utiliser la même salle le même jour : on ne devine
// jamais laquelle si l'heure actuelle ne tranche pas — un choix explicite
// est alors demandé (voir /qr-salle/[salle]) plutôt que de risquer de
// pointer vers le mauvais cours.
export async function resoudreSeanceDuJourPourSalle(
  salle: string,
  maintenant: Date = new Date(),
): Promise<SeanceDuJourSalle> {
  const anneeId = await anneeScolaireActiveId();
  if (!anneeId) {
    return { trouvee: false, raison: "SALLE_INCONNUE" };
  }

  const classes = await prisma.classe.findMany({
    where: { salle, anneeScolaireId: anneeId },
    include: { cours: true, enseignants: { include: { utilisateur: true } } },
  });
  if (classes.length === 0) {
    return { trouvee: false, raison: "SALLE_INCONNUE" };
  }

  const date = aujourdhuiUTC(maintenant);
  const seancesDuJour = await prisma.seance.findMany({
    where: { classeId: { in: classes.map((c) => c.id) }, date, statut: { not: "ANNULEE" } },
  });
  if (seancesDuJour.length === 0) {
    return { trouvee: false, raison: "PAS_DE_SEANCE" };
  }

  const candidats: CandidatSeanceSalle[] = seancesDuJour.map((s) => {
    const classe = classes.find((c) => c.id === s.classeId)!;
    return {
      seanceId: s.id,
      classeId: classe.id,
      coursNom: classe.cours.nom,
      niveau: classe.niveau,
      heureDebut: classe.heureDebut,
      heureFin: classe.heureFin,
      enseignants: classe.enseignants
        .map((e) => `${e.utilisateur.prenom} ${e.utilisateur.nom}`)
        .join(", "),
    };
  });

  if (candidats.length === 1) {
    return { trouvee: true, classeId: candidats[0].classeId, seanceId: candidats[0].seanceId };
  }

  const heure = heureActuelle(maintenant);
  const enCours = candidats.filter((c) => heure >= c.heureDebut && heure <= c.heureFin);
  if (enCours.length === 1) {
    return { trouvee: true, classeId: enCours[0].classeId, seanceId: enCours[0].seanceId };
  }

  return { trouvee: false, raison: "AMBIGU", candidats };
}
