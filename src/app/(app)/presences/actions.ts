"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, requireRole, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { requireModule, Module } from "@/lib/permissions";
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

function retourClasse(classeId: string, erreur?: string): never {
  redirect(erreur ? `/classes/${classeId}?error=${erreur}` : `/classes/${classeId}?ok=1`);
}

// inscrireEtudiantAction/retirerEtudiantAction sont utilisées à la fois
// depuis la fiche classe et depuis la fiche étudiant (voir les deux
// page.tsx) : le champ caché "origine" indique où rediriger après coup.
function retourInscription(
  origine: string | null,
  classeId: string,
  etudiantId: string | null,
  erreur?: string,
): never {
  if (origine === "etudiant" && etudiantId) {
    redirect(erreur ? `/etudiants/${etudiantId}?error=${erreur}` : `/etudiants/${etudiantId}?ok=1`);
  }
  retourClasse(classeId, erreur);
}

/**
 * (Re)génère les séances d'une classe sur son année scolaire, en sautant les
 * périodes de fermeture. Idempotent : les séances déjà présentes ne sont pas
 * recréées, et celles déjà validées ne sont jamais touchées.
 *
 * Carve-out littéral volontaire (pas de requireModule) : le module Présences
 * accorde ECRITURE à Enseignant (validation de sa propre feuille, scopée) et
 * à Accueil/Trésorier, alors que cette action — comme annulerSeanceAction et
 * les fermetures ci-dessous — reste strictement Bureau/Administration.
 */
export async function genererSeancesAction(formData: FormData): Promise<void> {
  await requireRole([Role.BUREAU, Role.ADMINISTRATION]);

  const classeId = champTexte(formData, "classeId");
  if (!classeId) redirect("/classes");

  const classe = await prisma.classe.findUnique({
    where: { id: classeId },
    include: {
      anneeScolaire: { include: { periodesFermeture: true } },
    },
  });
  if (!classe) retourClasse(classeId, "CLASSE_INTROUVABLE");

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
  retourClasse(classeId);
}

// Rattachée au module Étudiants (pas Présences) : c'est un acte de gestion
// du dossier de l'étudiant, même si elle vit ici pour rester à côté de
// retirerEtudiantAction (voir aussi classes/[id]/page.tsx et etudiants/[id]/page.tsx).
export async function inscrireEtudiantAction(formData: FormData): Promise<void> {
  await requireModule(Module.ETUDIANTS, "ECRITURE");

  const origine = champTexte(formData, "origine");
  const classeId = champTexte(formData, "classeId");
  const etudiantId = champTexte(formData, "etudiantId");
  if (!classeId) redirect("/classes");
  if (!etudiantId) retourInscription(origine, classeId, etudiantId, "INSCRIPTION_INVALIDE");

  await prisma.$transaction([
    prisma.inscriptionClasse.createMany({
      data: [{ classeId, etudiantId }],
      skipDuplicates: true,
    }),
    // Le souhait de section exprimé à la préinscription (voir
    // preinscription/actions.ts) est satisfait dès que l'étudiant est
    // effectivement inscrit à une classe, quelle qu'elle soit.
    prisma.etudiant.update({
      where: { id: etudiantId },
      data: { sectionSouhaiteeId: null },
    }),
  ]);

  revalidatePath(`/classes/${classeId}`);
  revalidatePath(`/etudiants/${etudiantId}`);
  retourInscription(origine, classeId, etudiantId);
}

export async function retirerEtudiantAction(formData: FormData): Promise<void> {
  await requireModule(Module.ETUDIANTS, "ECRITURE");

  const origine = champTexte(formData, "origine");
  const inscriptionId = champTexte(formData, "inscriptionId");
  const classeId = champTexte(formData, "classeId");
  const etudiantId = champTexte(formData, "etudiantId");
  if (!classeId) redirect("/classes");
  if (!inscriptionId) retourInscription(origine, classeId, etudiantId, "INSCRIPTION_INVALIDE");

  await prisma.inscriptionClasse.delete({ where: { id: inscriptionId } });

  revalidatePath(`/classes/${classeId}`);
  if (etudiantId) revalidatePath(`/etudiants/${etudiantId}`);
  retourInscription(origine, classeId, etudiantId);
}

// Une session restreinte au QR (voir requireSession dans src/lib/auth.ts) ne
// doit jamais atterrir sur /presences/{id} : cette page appelle
// requireSession() sans allowedSeanceId et la renverrait aussitôt vers
// /appel/{id}, cassant la page pour l'enseignant connecté via QR. On la
// redirige donc directement vers sa feuille isolée ; le staff connecté
// normalement garde /presences/{id} comme avant.
function retourSeance(seanceId: string, erreur?: string, session?: SessionUser): never {
  const base =
    session?.seanceRestreinteId === seanceId ? `/appel/${seanceId}` : `/presences/${seanceId}`;
  redirect(erreur ? `${base}?error=${erreur}` : `${base}?ok=1`);
}

// Carve-out littéral (voir le commentaire de genererSeancesAction ci-dessus).
export async function annulerSeanceAction(formData: FormData): Promise<void> {
  await requireRole([Role.BUREAU, Role.ADMINISTRATION]);

  const seanceId = champTexte(formData, "seanceId");
  if (!seanceId) redirect("/presences");

  await prisma.seance.update({
    where: { id: seanceId },
    data: {
      statut: "ANNULEE",
      motifAnnulation: champTexte(formData, "motifAnnulation"),
    },
  });

  revalidatePath("/presences");
  revalidatePath(`/presences/${seanceId}`);
  retourSeance(seanceId);
}

function retourFermetures(erreur?: string): never {
  redirect(erreur ? `/presences/fermetures?error=${erreur}` : "/presences/fermetures?ok=1");
}

// Fermetures : carve-out littéral (voir le commentaire de
// genererSeancesAction ci-dessus).
export async function creerPeriodeFermetureAction(
  formData: FormData,
): Promise<void> {
  await requireRole([Role.BUREAU, Role.ADMINISTRATION]);

  const anneeScolaireId = champTexte(formData, "anneeScolaireId");
  const libelle = champTexte(formData, "libelle");
  const dateDebut = champTexte(formData, "dateDebut");
  const dateFin = champTexte(formData, "dateFin");
  if (!anneeScolaireId || !libelle || !dateDebut || !dateFin) {
    retourFermetures("CHAMPS_MANQUANTS");
  }

  await prisma.periodeFermeture.create({
    data: {
      anneeScolaireId,
      libelle,
      dateDebut: new Date(dateDebut),
      dateFin: new Date(dateFin),
    },
  });

  revalidatePath("/presences/fermetures");
  retourFermetures();
}

export async function modifierPeriodeFermetureAction(
  formData: FormData,
): Promise<void> {
  const session = await requireRole([Role.BUREAU, Role.ADMINISTRATION]);

  const periodeId = champTexte(formData, "periodeId");
  const libelle = champTexte(formData, "libelle");
  const dateDebut = champTexte(formData, "dateDebut");
  const dateFin = champTexte(formData, "dateFin");
  if (!periodeId) redirect("/presences/fermetures");
  if (!libelle || !dateDebut || !dateFin) retourFermetures("CHAMPS_MANQUANTS");

  await prisma.$transaction([
    prisma.periodeFermeture.update({
      where: { id: periodeId },
      data: { libelle, dateDebut: new Date(dateDebut), dateFin: new Date(dateFin) },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_fermeture",
        entite: "PeriodeFermeture",
        entiteId: periodeId,
      },
    }),
  ]);

  revalidatePath("/presences/fermetures");
  retourFermetures();
}

export async function supprimerPeriodeFermetureAction(
  formData: FormData,
): Promise<void> {
  const session = await requireRole([Role.BUREAU, Role.ADMINISTRATION]);

  const periodeId = champTexte(formData, "periodeId");
  if (!periodeId) redirect("/presences/fermetures");

  const cible = await prisma.periodeFermeture.findUnique({ where: { id: periodeId } });
  if (!cible) retourFermetures("FERMETURE_INTROUVABLE");

  await prisma.$transaction([
    prisma.periodeFermeture.delete({ where: { id: periodeId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_fermeture",
        entite: "PeriodeFermeture",
        entiteId: periodeId,
        details: { libelle: cible.libelle },
      },
    }),
  ]);

  revalidatePath("/presences/fermetures");
  retourFermetures();
}

/**
 * Valide la feuille de présence d'une séance. Chaque étudiant inscrit doit
 * avoir un statut explicite : on ne devine jamais les absents (règle non
 * négociable). Le formulaire pré-coche « Présent » pour tous, l'enseignant
 * ne saisit que les exceptions, mais rien n'est écrit sans validation.
 */
export async function validerPresencesAction(formData: FormData): Promise<void> {
  const seanceId = champTexte(formData, "seanceId");
  if (!seanceId) redirect("/presences");

  const session = await requireSession({ allowedSeanceId: seanceId });

  const seance = await prisma.seance.findUnique({
    where: { id: seanceId },
    include: {
      classe: {
        include: {
          // Seuls les étudiants au dossier validé font l'appel : une
          // préinscription n'apparaît jamais en présences.
          inscriptions: {
            where: { etudiant: { statutInscription: "VALIDE" } },
          },
        },
      },
    },
  });
  if (!seance || seance.statut === "ANNULEE") {
    retourSeance(seanceId, "SEANCE_INDISPONIBLE", session);
  }

  if (!(await peutAccederClasse(session, seance.classeId))) {
    retourSeance(seanceId, "ACCES_REFUSE", session);
  }

  // Une séance déjà validée n'est modifiable par l'enseignant que le jour
  // même ; l'administration peut corriger sans limite.
  if (
    seance.statut === "VALIDEE" &&
    !estAdministratif(session.role) &&
    !enseignantPeutCorriger(seance.date)
  ) {
    retourSeance(seanceId, "DELAI_CORRECTION_DEPASSE", session);
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
  if (saisies.length !== seance.classe.inscriptions.length) {
    retourSeance(seanceId, "SAISIE_INCOMPLETE", session);
  }

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
  // Pas de redirect avec ?ok=1 ici : la page affiche déjà un état de succès
  // dérivé du statut VALIDEE en base (voir presences/[id]/page.tsx), donc un
  // message générique en plus ferait doublon.
}
