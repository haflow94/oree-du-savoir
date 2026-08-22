import { prisma } from "@/lib/prisma";
import { aujourdhuiUTC, ajouterJoursUTC } from "@/lib/calendrier";
import { RAPPEL_JOURS } from "@/lib/activites-recurrence";

export * from "@/lib/activites-recurrence";

// Activités à venir dans la fenêtre de rappel, pour le bandeau du tableau de
// bord et la pastille du menu (voir (app)/layout.tsx et (app)/page.tsx).
export async function activitesARappeler() {
  const aujourdhui = aujourdhuiUTC();
  return prisma.activite.findMany({
    where: { date: { gte: aujourdhui, lte: ajouterJoursUTC(aujourdhui, RAPPEL_JOURS) } },
    orderBy: { date: "asc" },
  });
}
