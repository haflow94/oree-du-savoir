"use server";

import { revalidatePath } from "next/cache";
import { requireSession, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { peutAccederClasse, estAdministratif } from "@/lib/acces-presence";
import {
  StatutPresence,
  datesDesSeances,
  enseignantPeutCorriger,
} from "@/lib/presences";

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

/**
 * (Re)génère les séances d'une classe sur son année scolaire, en sautant les
 * périodes de fermeture. Idempotent : les séances déjà présentes ne sont pas
 * recréées, et celles déjà validées ne sont jamais touchées.
 */
export async function genererSeancesAction(formData: FormData): Promise<void> {
  await requireRole([Role.BUREAU, Role.ADMINISTRATION]);

  const classeId = champTexte(formData, "classeId");
  if (!classeId) return;

  const classe = await prisma.classe.findUnique({
    where: { id: classeId },
    include: {
      anneeScolaire: { include: { periodesFermeture: true } },
    },
  });
  if (!classe) return;

  const dates = datesDesSeances(
    classe.jour,
    classe.anneeScolaire.dateDebut,
    classe.anneeScolaire.dateFin,
    classe.anneeScolaire.periodesFermeture,
  );

  await prisma.seance.createMany({
    data: dates.map((date) => ({ classeId, date })),
    skipDuplicates: true,
  });

  revalidatePath(`/classes/${classeId}`);
  revalidatePath("/presences");
}

export async function inscrireEtudiantAction(formData: FormData): Promise<void> {
  await requireRole([Role.BUREAU, Role.ADMINISTRATION, Role.ACCUEIL]);

  const classeId = champTexte(formData, "classeId");
  const etudiantId = champTexte(formData, "etudiantId");
  if (!classeId || !etudiantId) return;

  await prisma.inscriptionClasse.createMany({
    data: [{ classeId, etudiantId }],
    skipDuplicates: true,
  });

  revalidatePath(`/classes/${classeId}`);
}

export async function retirerEtudiantAction(formData: FormData): Promise<void> {
  await requireRole([Role.BUREAU, Role.ADMINISTRATION, Role.ACCUEIL]);

  const inscriptionId = champTexte(formData, "inscriptionId");
  const classeId = champTexte(formData, "classeId");
  if (!inscriptionId || !classeId) return;

  await prisma.inscriptionClasse.delete({ where: { id: inscriptionId } });
  revalidatePath(`/classes/${classeId}`);
}

export async function annulerSeanceAction(formData: FormData): Promise<void> {
  await requireRole([Role.BUREAU, Role.ADMINISTRATION]);

  const seanceId = champTexte(formData, "seanceId");
  if (!seanceId) return;

  await prisma.seance.update({
    where: { id: seanceId },
    data: {
      statut: "ANNULEE",
      motifAnnulation: champTexte(formData, "motifAnnulation"),
    },
  });

  revalidatePath("/presences");
  revalidatePath(`/presences/${seanceId}`);
}

export async function creerPeriodeFermetureAction(
  formData: FormData,
): Promise<void> {
  await requireRole([Role.BUREAU, Role.ADMINISTRATION]);

  const anneeScolaireId = champTexte(formData, "anneeScolaireId");
  const libelle = champTexte(formData, "libelle");
  const dateDebut = champTexte(formData, "dateDebut");
  const dateFin = champTexte(formData, "dateFin");
  if (!anneeScolaireId || !libelle || !dateDebut || !dateFin) return;

  await prisma.periodeFermeture.create({
    data: {
      anneeScolaireId,
      libelle,
      dateDebut: new Date(dateDebut),
      dateFin: new Date(dateFin),
    },
  });

  revalidatePath("/presences/fermetures");
}

/**
 * Valide la feuille de présence d'une séance. Chaque étudiant inscrit doit
 * avoir un statut explicite : on ne devine jamais les absents (règle non
 * négociable). Le formulaire pré-coche « Présent » pour tous, l'enseignant
 * ne saisit que les exceptions, mais rien n'est écrit sans validation.
 */
export async function validerPresencesAction(formData: FormData): Promise<void> {
  const session = await requireSession();

  const seanceId = champTexte(formData, "seanceId");
  if (!seanceId) return;

  const seance = await prisma.seance.findUnique({
    where: { id: seanceId },
    include: { classe: { include: { inscriptions: true } } },
  });
  if (!seance || seance.statut === "ANNULEE") return;

  if (!(await peutAccederClasse(session, seance.classeId))) return;

  // Une séance déjà validée n'est modifiable par l'enseignant que le jour
  // même ; l'administration peut corriger sans limite.
  if (
    seance.statut === "VALIDEE" &&
    !estAdministratif(session.role) &&
    !enseignantPeutCorriger(seance.date)
  ) {
    return;
  }

  const saisies = seance.classe.inscriptions
    .map((inscription) => {
      const valeur = formData.get(`statut_${inscription.etudiantId}`);
      if (typeof valeur !== "string" || !(valeur in StatutPresence)) return null;
      return {
        etudiantId: inscription.etudiantId,
        statut: valeur as StatutPresence,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  // Refuse une validation partielle : mieux vaut ne rien écrire que d'écrire
  // une feuille incomplète qui ressemblerait à une feuille validée.
  if (saisies.length !== seance.classe.inscriptions.length) return;

  const saisieViaPapier = formData.get("saisieViaPapier") === "1";

  await prisma.$transaction([
    ...saisies.map((s) =>
      prisma.presence.upsert({
        where: {
          seanceId_etudiantId: { seanceId, etudiantId: s.etudiantId },
        },
        create: { seanceId, etudiantId: s.etudiantId, statut: s.statut },
        update: { statut: s.statut },
      }),
    ),
    prisma.seance.update({
      where: { id: seanceId },
      data: {
        statut: "VALIDEE",
        valideeLe: new Date(),
        valideeParId: session.id,
        saisieViaPapier,
      },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: seance.statut === "VALIDEE" ? "correction_presence" : "validation_presence",
        entite: "Seance",
        entiteId: seanceId,
        details: { saisieViaPapier, nombreEtudiants: saisies.length },
      },
    }),
  ]);

  revalidatePath("/presences");
  revalidatePath(`/presences/${seanceId}`);
}
