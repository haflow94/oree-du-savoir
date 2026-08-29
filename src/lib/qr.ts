import "server-only";
import { prisma } from "@/lib/prisma";
import { aujourdhuiUTC } from "@/lib/presences";
import { anneeScolaireActiveId } from "@/lib/sections-etudiant";

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
  | { trouvee: true; classeId: string; seanceId: string; salleNom: string }
  | { trouvee: false; raison: "TOKEN_INCONNU" }
  | { trouvee: false; raison: "PAS_DE_SEANCE"; salleNom: string }
  | { trouvee: false; raison: "AMBIGU"; salleNom: string; candidats: CandidatSeanceSalle[] };

// "HH:mm" en heure locale du serveur (même logique que aujourdhuiUTC : on
// veut l'heure que voit la personne en salle, pas celle du méridien de
// Greenwich). Comparable directement à Classe.heureDebut/heureFin, stockés
// au même format.
function heureActuelle(maintenant: Date = new Date()): string {
  const h = String(maintenant.getHours()).padStart(2, "0");
  const m = String(maintenant.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// Résout le QR permanent affiché en salle (un seul code fixe par salle,
// jamais changé entre les cours qui s'y succèdent — contrainte physique de
// l'association : impossible d'imprimer/afficher un QR différent à chaque
// changement de classe, et ce jeton ne contient aucune donnée personnelle)
// vers la séance du jour à faire maintenant. Utilisé à la fois par
// /qr/[token] (accès direct si déjà connecté) et par la connexion déclenchée
// depuis ce même QR (voir src/app/login/actions.ts), pour que la session
// créée soit restreinte à cette séance précise dès sa création quand la
// résolution est univoque. Plusieurs classes différentes peuvent utiliser la
// même salle le même jour : on ne devine jamais laquelle si l'heure actuelle
// ne tranche pas — un choix explicite est alors demandé (voir
// /qr/[token]/page.tsx) plutôt que de risquer de pointer vers le mauvais
// cours.
export async function resoudreSeanceDuJourPourSalle(
  token: string,
  maintenant: Date = new Date(),
): Promise<SeanceDuJourSalle> {
  const salle = await prisma.salle.findUnique({ where: { qrToken: token } });
  if (!salle) {
    return { trouvee: false, raison: "TOKEN_INCONNU" };
  }

  const anneeId = await anneeScolaireActiveId();
  if (!anneeId) {
    return { trouvee: false, raison: "PAS_DE_SEANCE", salleNom: salle.nom };
  }

  const classes = await prisma.classe.findMany({
    where: { salleId: salle.id, anneeScolaireId: anneeId },
    include: { cours: true, enseignants: { include: { utilisateur: true } } },
  });
  if (classes.length === 0) {
    return { trouvee: false, raison: "PAS_DE_SEANCE", salleNom: salle.nom };
  }

  const date = aujourdhuiUTC(maintenant);
  const seancesDuJour = await prisma.seance.findMany({
    where: { classeId: { in: classes.map((c) => c.id) }, date, statut: { not: "ANNULEE" } },
  });
  if (seancesDuJour.length === 0) {
    return { trouvee: false, raison: "PAS_DE_SEANCE", salleNom: salle.nom };
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
    return {
      trouvee: true,
      classeId: candidats[0].classeId,
      seanceId: candidats[0].seanceId,
      salleNom: salle.nom,
    };
  }

  const heure = heureActuelle(maintenant);
  const enCours = candidats.filter((c) => heure >= c.heureDebut && heure <= c.heureFin);
  if (enCours.length === 1) {
    return {
      trouvee: true,
      classeId: enCours[0].classeId,
      seanceId: enCours[0].seanceId,
      salleNom: salle.nom,
    };
  }

  return { trouvee: false, raison: "AMBIGU", salleNom: salle.nom, candidats };
}
