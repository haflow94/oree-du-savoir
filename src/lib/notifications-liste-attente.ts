// Pas de `import "server-only"` ici : même raison que
// notifications-preinscription.ts — ne touche que Prisma (mocké dans les
// tests, voir notifications-liste-attente.test.ts), jamais importé depuis un
// composant client.
import { prisma } from "@/lib/prisma";
import type { JourSemaine } from "@/generated/prisma/enums";

// Même limite que dernieresNotificationsPreinscription (voir son
// commentaire) : la cloche du Topbar et le Dashboard n'affichent qu'un
// raccourci vers les dernières mises en attente, la liste complète par bloc
// reste consultable depuis /classes/cohortes/[id] (source de vérité).
const LIMITE_DERNIERES = 10;

export type NotificationListeAttenteAffichee = {
  id: string;
  etudiantId: string;
  nomEtudiant: string;
  prenomEtudiant: string;
  cohorteId: string;
  sectionNom: string;
  niveau: string | null;
  jour: JourSemaine;
  rangListeAttente: number | null;
  creeLe: Date;
  lue: boolean;
};

// Filtre commun aux deux fonctions ci-dessous : une notification n'est
// « active » (comptée, affichée dans la cloche/le Dashboard) que tant que
// l'AffectationCohorte associée est toujours EN_ATTENTE. Dès qu'elle passe
// AFFECTE (promotion, voir promouvoirAffectationCohorteAction) ou est
// retirée (cascade), la notification sort du badge/de la liste sans jamais
// être supprimée ni modifiée en base pour le cas « promue » — purement
// dérivé du statut réel de l'affectation à chaque lecture, jamais un second
// état à maintenir en synchronisation manuelle (voir
// NotificationListeAttente, prisma/schema.prisma).
const AFFECTATION_ACTIVE = { statut: "EN_ATTENTE" as const };

// Compte non lu pour UN utilisateur donné (voir LectureListeAttente,
// prisma/schema.prisma) : état de lecture individuel, indépendamment de ce
// que d'autres membres du staff en ont fait.
export async function nombreNotificationsListeAttenteNonLues(
  utilisateurId: string,
): Promise<number> {
  return prisma.notificationListeAttente.count({
    where: { lectures: { none: { utilisateurId } }, affectationCohorte: AFFECTATION_ACTIVE },
  });
}

// Dernières notifications ACTIVES (lues ou non, voir LIMITE_DERNIERES), avec
// leur état de lecture calculé pour CET utilisateur uniquement.
export async function dernieresNotificationsListeAttente(
  utilisateurId: string,
): Promise<NotificationListeAttenteAffichee[]> {
  const notifications = await prisma.notificationListeAttente.findMany({
    where: { affectationCohorte: AFFECTATION_ACTIVE },
    orderBy: { creeLe: "desc" },
    take: LIMITE_DERNIERES,
    include: {
      affectationCohorte: {
        select: {
          etudiantId: true,
          cohorteId: true,
          rangListeAttente: true,
          etudiant: { select: { nom: true, prenom: true } },
          cohorte: { select: { niveau: true, jour: true, section: { select: { nom: true } } } },
        },
      },
      lectures: { where: { utilisateurId }, select: { id: true } },
    },
  });

  return notifications.map((n) => ({
    id: n.id,
    etudiantId: n.affectationCohorte.etudiantId,
    nomEtudiant: n.affectationCohorte.etudiant.nom,
    prenomEtudiant: n.affectationCohorte.etudiant.prenom,
    cohorteId: n.affectationCohorte.cohorteId,
    sectionNom: n.affectationCohorte.cohorte.section.nom,
    niveau: n.affectationCohorte.cohorte.niveau,
    jour: n.affectationCohorte.cohorte.jour,
    rangListeAttente: n.affectationCohorte.rangListeAttente,
    creeLe: n.creeLe,
    lue: n.lectures.length > 0,
  }));
}

// Marque une notification comme lue pour CET utilisateur — `upsert` pour
// rester idempotent face à un double clic/second appel réseau (même
// justification que marquerNotificationPreinscriptionLue).
export async function marquerNotificationListeAttenteLue(
  notificationId: string,
  utilisateurId: string,
): Promise<void> {
  await prisma.lectureListeAttente.upsert({
    where: { notificationId_utilisateurId: { notificationId, utilisateurId } },
    create: { notificationId, utilisateurId },
    update: {},
  });
}
