import "server-only";
import { prisma } from "@/lib/prisma";
import { estAdministratif } from "@/lib/acces-presence";
import { enseignantPeutCorriger } from "@/lib/presences";
import type { SessionUser } from "@/lib/auth";
import type { LigneAppel } from "@/app/(app)/presences/[id]/feuille-appel";

export type SeanceAvecAppel = NonNullable<
  Awaited<ReturnType<typeof chargerSeanceAvecAppel>>
>["seance"];

// Requête + mise en forme partagées entre la feuille de présence normale
// (dans l'appli, `(app)/presences/[id]`) et la feuille isolée accessible via
// QR (`/appel/[seanceId]`, hors de tout menu) — même séance, même règles de
// verrouillage, deux écrans différents.
export async function chargerSeanceAvecAppel(seanceId: string, session: SessionUser) {
  const seance = await prisma.seance.findUnique({
    where: { id: seanceId },
    include: {
      classe: {
        include: {
          cours: true,
          salle: true,
          // Seuls les étudiants au dossier validé font l'appel : une
          // préinscription n'apparaît jamais en présences.
          inscriptions: {
            where: { etudiant: { statutInscription: "VALIDE" } },
            include: { etudiant: true },
            orderBy: { etudiant: { nom: "asc" } },
          },
        },
      },
      presences: true,
      valideePar: true,
    },
  });

  if (!seance) return null;

  const administratif = estAdministratif(session.role);
  const verrouillee =
    seance.statut === "VALIDEE" &&
    !administratif &&
    !enseignantPeutCorriger(seance.date);

  const parEtudiant = new Map(seance.presences.map((p) => [p.etudiantId, p.statut]));
  const lignes: LigneAppel[] = seance.classe.inscriptions.map((i) => ({
    etudiantId: i.etudiantId,
    nom: i.etudiant.nom,
    prenom: i.etudiant.prenom,
    statutInitial: parEtudiant.get(i.etudiantId) ?? null,
  }));

  return { seance, lignes, verrouillee, administratif };
}
