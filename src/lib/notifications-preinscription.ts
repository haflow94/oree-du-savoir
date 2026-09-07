// Pas de `import "server-only"` ici : même raison que preinscription-code.ts
// et preinscription-token.ts — ne touche que Prisma (déjà mocké dans les
// tests, voir notifications-preinscription.test.ts), jamais importé depuis
// un composant client.
import { prisma } from "@/lib/prisma";

// Nombre de notifications les plus récentes affichées dans la cloche du
// Topbar (voir src/components/topbar.tsx) : la liste complète reste
// consultable depuis /inscriptions elle-même (source de vérité), la cloche
// n'est qu'un raccourci vers les dernières arrivées.
const LIMITE_DERNIERES = 10;

export type NotificationPreinscriptionAffichee = {
  id: string;
  etudiantId: string;
  nom: string;
  prenom: string;
  creeLe: Date;
  lue: boolean;
};

// Filtre commun aux deux fonctions ci-dessous : une notification n'est
// « active » (comptée, affichée dans la cloche) que tant que l'étudiant
// associé est toujours PREINSCRIT. Dès que le dossier passe VALIDE (voir
// validerInscriptionAction, (app)/etudiants/[id]/actions.ts — le seul
// endroit de l'app qui pose ce statut), la notification sort du badge/de la
// liste SANS jamais être supprimée ni modifiée en base : purement dérivé du
// statut réel de l'étudiant à chaque lecture, jamais un second état à
// maintenir en synchronisation manuelle (pas de flag « traitée » séparé,
// donc jamais désynchronisable de la vraie décision métier). L'historique
// complet reste consultable en base (et reste rattaché au bon étudiant même
// après une fusion de doublon, voir fusionnerDoublonAction).
const ETUDIANT_ACTIF: { statutInscription: "PREINSCRIT" } = { statutInscription: "PREINSCRIT" };

// Compte non lu pour UN utilisateur donné (voir LecturePreinscription,
// prisma/schema.prisma) : une notification sans ligne de lecture pour cet
// utilisateur compte comme non lue pour lui, indépendamment de ce que
// d'autres membres du staff en ont fait — c'est le point central de l'état
// de lecture individuel demandé (deux utilisateurs peuvent avoir un compte
// différent sur les mêmes notifications).
export async function nombreNotificationsPreinscriptionNonLues(
  utilisateurId: string,
): Promise<number> {
  return prisma.notificationPreinscription.count({
    where: { lectures: { none: { utilisateurId } }, etudiant: ETUDIANT_ACTIF },
  });
}

// Dernières notifications ACTIVES (lues ou non, voir LIMITE_DERNIERES), avec
// leur état de lecture calculé pour CET utilisateur uniquement — jamais un
// état partagé entre utilisateurs.
export async function dernieresNotificationsPreinscription(
  utilisateurId: string,
): Promise<NotificationPreinscriptionAffichee[]> {
  const notifications = await prisma.notificationPreinscription.findMany({
    where: { etudiant: ETUDIANT_ACTIF },
    orderBy: { creeLe: "desc" },
    take: LIMITE_DERNIERES,
    include: {
      etudiant: { select: { nom: true, prenom: true } },
      lectures: { where: { utilisateurId }, select: { id: true } },
    },
  });

  return notifications.map((n) => ({
    id: n.id,
    etudiantId: n.etudiantId,
    nom: n.etudiant.nom,
    prenom: n.etudiant.prenom,
    creeLe: n.creeLe,
    lue: n.lectures.length > 0,
  }));
}

// Marque une notification comme lue pour CET utilisateur (voir
// (app)/inscriptions/actions.ts#marquerNotificationPreinscriptionLueAction).
// `upsert` plutôt que `create` : cliquer deux fois sur la même notification
// (ou un second appel réseau) ne doit jamais échouer sur la contrainte
// d'unicité [notificationId, utilisateurId] — idempotent par construction,
// ne touche jamais l'état de lecture des autres utilisateurs.
export async function marquerNotificationPreinscriptionLue(
  notificationId: string,
  utilisateurId: string,
): Promise<void> {
  await prisma.lecturePreinscription.upsert({
    where: { notificationId_utilisateurId: { notificationId, utilisateurId } },
    create: { notificationId, utilisateurId },
    update: {},
  });
}
