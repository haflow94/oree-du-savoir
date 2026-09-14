import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activitesARappeler } from "@/lib/activites";
import { peutAccederModule, Module } from "@/lib/permissions";
import {
  nombreNotificationsPreinscriptionNonLues,
  dernieresNotificationsPreinscription,
} from "@/lib/notifications-preinscription";
import {
  nombreNotificationsListeAttenteNonLues,
  dernieresNotificationsListeAttente,
} from "@/lib/notifications-liste-attente";
import { Role } from "@/lib/roles";
import { NAV_ITEMS } from "@/lib/nav";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Une session restreinte au QR (voir SessionUser dans src/lib/auth.ts) est
  // toujours redirigée par requireSession() vers /appel/{id} — une page hors
  // de ce layout, donc jamais de menu à cacher ici : si on arrive jusque-là,
  // c'est qu'on a le droit de voir l'appli normale.
  const session = await requireSession();
  // Détermine si CE rôle peut voir les notifications de préinscription avant
  // même d'aller les chercher : les destinataires ne sont jamais une liste
  // stockée, seulement « qui a LECTURE sur Module.INSCRIPTIONS en ce moment »
  // (voir NotificationPreinscription, prisma/schema.prisma) — un rôle sans
  // ce droit n'a même pas la requête exécutée pour lui, cohérent avec le
  // reste du menu ci-dessous.
  const peutVoirNotificationsPreinscription = await peutAccederModule(
    session.role,
    Module.INSCRIPTIONS,
    "LECTURE",
  );
  // Même principe pour les mises en liste d'attente (voir
  // NotificationListeAttente, prisma/schema.prisma) : gouverné par
  // Module.CLASSES, qui régit la consultation des Cohortes/de leur liste
  // d'attente (voir (app)/classes/cohortes/[id]/page.tsx).
  const peutVoirNotificationsListeAttente = await peutAccederModule(
    session.role,
    Module.CLASSES,
    "LECTURE",
  );
  const [
    anneeActive,
    rappels,
    visibilites,
    nombreNotificationsNonLues,
    dernieresNotifications,
    nombreListeAttenteNonLues,
    dernieresListeAttente,
  ] = await Promise.all([
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
    activitesARappeler(),
    Promise.all(
      NAV_ITEMS.map((item) =>
        !item.module ? true : peutAccederModule(session.role, item.module, "LECTURE"),
      ),
    ),
    peutVoirNotificationsPreinscription
      ? nombreNotificationsPreinscriptionNonLues(session.id)
      : Promise.resolve(0),
    peutVoirNotificationsPreinscription
      ? dernieresNotificationsPreinscription(session.id)
      : Promise.resolve([]),
    peutVoirNotificationsListeAttente
      ? nombreNotificationsListeAttenteNonLues(session.id)
      : Promise.resolve(0),
    peutVoirNotificationsListeAttente
      ? dernieresNotificationsListeAttente(session.id)
      : Promise.resolve([]),
  ]);
  // Le tableau de bord (item sans module) agrège plusieurs modules, jamais
  // pertinent pour Enseignant qui n'a accès qu'à Présences (voir la
  // redirection dans (app)/page.tsx) — masqué ici pour cohérence du menu.
  //
  // On ne fait transiter que les `href` visibles (des chaînes, sérialisables)
  // du Server Component vers Sidebar/Topbar ("use client") : NAV_ITEMS
  // contient des composants icône (LucideIcon), que Next.js refuse de
  // sérialiser à travers la frontière serveur/client si on les passe en prop.
  const hrefsVisibles = NAV_ITEMS.filter(
    (item, i) => visibilites[i] && !(item.href === "/" && session.role === Role.ENSEIGNANT),
  ).map((item) => item.href);

  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar hrefsVisibles={hrefsVisibles} badges={{ "/activites": rappels.length }} />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Topbar
          nom={session.nom}
          prenom={session.prenom}
          role={session.role}
          hrefsVisibles={hrefsVisibles}
          anneeActive={anneeActive?.libelle ?? null}
          nombreNotificationsNonLues={nombreNotificationsNonLues}
          dernieresNotifications={dernieresNotifications}
          nombreListeAttenteNonLues={nombreListeAttenteNonLues}
          dernieresListeAttente={dernieresListeAttente}
        />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
