// Import ponctuel et idempotent du curriculum réel de la section Études
// Islamiques, à partir de matrice/Planning des cours.xlsx (hors repo, fourni
// par l'association). Relançable sans risque : Cours/Salle sont upsertés par
// leur nom unique, Cohorte par (section, niveau, jour), CohorteCours par sa
// clé composite, et Classe est recherchée avant création (pas de contrainte
// unique SQL sur ce modèle).
//
// Corrections/reconstructions appliquées par rapport au fichier source (à
// vérifier auprès de l'association, voir le rapport affiché en fin
// d'exécution) :
// - "BIOGHRAPHIE" -> "Biographie" (coquille).
// - "LE REGLES DE LA TRANSMISSION" -> "Les règles de la transmission" (accord).
// - "REGLES DES PRATIQUES CULT" (2e année, dimanche, S2, 12h-13h15) : titre
//   tronqué dans le fichier source, reconstruit en "Règles des pratiques
//   cultuelles" (sans numéro, car ce n'est pas le même cours que la 1ère
//   année) — à confirmer.
// - "SUITE MARIAGE- HISTOIRE DE L'ISLAM" (3e année, dimanche, S2,
//   12h-13h15) : gardé comme un seul intitulé combiné, à confirmer que ce
//   n'est pas 2 cours distincts mal saisis dans une seule cellule.
// - Le "Biographie du Prophète (1/2)" du samedi (sans la mention "(PSL)")
//   est unifié avec celui du dimanche (qui la porte) : traité comme le même
//   cours, partagé entre les deux cohortes jour.
// - Samedi, 1ère année, semestre 2 : le fichier source réutilise
//   littéralement les intitulés "(1)" (non "(2)") pour 2 des 3 créneaux —
//   gardé tel quel plutôt que renuméroté, incohérence probable côté fichier
//   source à vérifier avec l'association.
//
// Ne génère PAS les Seance : datesDesSeances() (src/lib/presences.ts) ignore
// Classe.semestre et balaierait toute l'année scolaire pour les 2 classes
// (S1 et S2) d'un même créneau, ce qui dupliquerait les séances. À générer
// depuis l'UI une fois les bornes de semestre confirmées avec l'association.

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SECTION_ID = "section-etudes-islamiques";

type EntreeClasse = {
  heureDebut: string;
  heureFin: string;
  semestre: "1" | "2";
  cours: string;
};

type EntreeCohorte = {
  niveau: string;
  jour: "DIMANCHE" | "SAMEDI";
  salle: string | null;
  classes: EntreeClasse[];
};

const CRENEAUX = {
  matin: { heureDebut: "09:00", heureFin: "10:15" },
  milieu: { heureDebut: "10:30", heureFin: "11:45" },
  midi: { heureDebut: "12:00", heureFin: "13:15" },
};

const COHORTES: EntreeCohorte[] = [
  {
    niveau: "1ère année",
    jour: "DIMANCHE",
    salle: "2/3",
    classes: [
      { ...CRENEAUX.matin, semestre: "1", cours: "Foi et spiritualité (1)" },
      { ...CRENEAUX.milieu, semestre: "1", cours: "Règles des pratiques cultuelles (1)" },
      { ...CRENEAUX.midi, semestre: "1", cours: "Biographie du Prophète (1) (PSL)" },
      { ...CRENEAUX.matin, semestre: "2", cours: "Foi et spiritualité (2)" },
      { ...CRENEAUX.milieu, semestre: "2", cours: "Règles des pratiques cultuelles (2)" },
      { ...CRENEAUX.midi, semestre: "2", cours: "Biographie du Prophète (2) (PSL)" },
    ],
  },
  {
    niveau: "2ème année",
    jour: "DIMANCHE",
    salle: null,
    classes: [
      { ...CRENEAUX.matin, semestre: "1", cours: "L'histoire des 4 califes" },
      { ...CRENEAUX.milieu, semestre: "1", cours: "Morale familiale" },
      { ...CRENEAUX.midi, semestre: "1", cours: "Sciences du Coran" },
      { ...CRENEAUX.matin, semestre: "2", cours: "Fiqh contemporain" },
      { ...CRENEAUX.milieu, semestre: "2", cours: "Sciences du hadith" },
      { ...CRENEAUX.midi, semestre: "2", cours: "Règles des pratiques cultuelles" },
    ],
  },
  {
    niveau: "3ème année",
    jour: "DIMANCHE",
    salle: "4",
    classes: [
      { ...CRENEAUX.matin, semestre: "1", cours: "Morale sociale et éthique" },
      { ...CRENEAUX.milieu, semestre: "1", cours: "Mariage et famille" },
      { ...CRENEAUX.midi, semestre: "1", cours: "Spiritualité — Livre de la revivification" },
      { ...CRENEAUX.matin, semestre: "2", cours: "Fondements et finalités" },
      { ...CRENEAUX.milieu, semestre: "2", cours: "Courants de pensée" },
      { ...CRENEAUX.midi, semestre: "2", cours: "Suite mariage — Histoire de l'Islam" },
    ],
  },
  {
    niveau: "4ème année",
    jour: "DIMANCHE",
    salle: "6",
    classes: [
      { ...CRENEAUX.matin, semestre: "1", cours: "Explication du Coran" },
      { ...CRENEAUX.milieu, semestre: "1", cours: "Les règles de la transmission" },
      { ...CRENEAUX.midi, semestre: "1", cours: "Introduction aux transactions" },
      { ...CRENEAUX.matin, semestre: "2", cours: "Explication du hadith" },
      { ...CRENEAUX.milieu, semestre: "2", cours: "Fiqh contemporain" },
      { ...CRENEAUX.midi, semestre: "2", cours: "Spiritualité — Da'wah" },
    ],
  },
  {
    niveau: "1ère année",
    jour: "SAMEDI",
    salle: null,
    classes: [
      { ...CRENEAUX.matin, semestre: "1", cours: "Biographie du Prophète (1) (PSL)" },
      { ...CRENEAUX.milieu, semestre: "1", cours: "Règles des pratiques cultuelles (1)" },
      { ...CRENEAUX.midi, semestre: "1", cours: "Foi et spiritualité (1)" },
      { ...CRENEAUX.matin, semestre: "2", cours: "Biographie du Prophète (2) (PSL)" },
      { ...CRENEAUX.milieu, semestre: "2", cours: "Règles des pratiques cultuelles (1)" },
      { ...CRENEAUX.midi, semestre: "2", cours: "Foi et spiritualité (1)" },
    ],
  },
  {
    niveau: "2ème année",
    jour: "SAMEDI",
    salle: null,
    classes: [
      { ...CRENEAUX.matin, semestre: "1", cours: "L'histoire des 4 califes" },
      { ...CRENEAUX.milieu, semestre: "1", cours: "Morale familiale" },
      { ...CRENEAUX.midi, semestre: "1", cours: "Règles des pratiques cultuelles" },
      { ...CRENEAUX.matin, semestre: "2", cours: "Règles des pratiques cultuelles" },
      { ...CRENEAUX.milieu, semestre: "2", cours: "Fiqh contemporain" },
      { ...CRENEAUX.midi, semestre: "2", cours: "Sciences du hadith" },
    ],
  },
];

async function main() {
  const anneeActive = await prisma.anneeScolaire.findFirst({ where: { active: true } });
  if (!anneeActive) throw new Error("Aucune année scolaire active — abandon.");

  const coursIdParNom = new Map<string, string>();
  const salleIdParNom = new Map<string, string>();
  let nbCoursCrees = 0;
  let nbCohortesCrees = 0;
  let nbSallesCreees = 0;
  let nbClassesCreees = 0;

  for (const entree of COHORTES) {
    const cohorte = await prisma.cohorte.upsert({
      where: { sectionId_niveau_jour: { sectionId: SECTION_ID, niveau: entree.niveau, jour: entree.jour } },
      update: {},
      create: { sectionId: SECTION_ID, niveau: entree.niveau, jour: entree.jour },
    });
    nbCohortesCrees++;

    let salleId: string | null = null;
    if (entree.salle) {
      if (!salleIdParNom.has(entree.salle)) {
        const salle = await prisma.salle.upsert({
          where: { nom: entree.salle },
          update: {},
          create: { nom: entree.salle },
        });
        salleIdParNom.set(entree.salle, salle.id);
        nbSallesCreees++;
      }
      salleId = salleIdParNom.get(entree.salle)!;
    }

    let ordre = 0;
    const coursDejaLies = new Set<string>();

    for (const c of entree.classes) {
      if (!coursIdParNom.has(c.cours)) {
        const cours = await prisma.cours.upsert({
          where: { nom: c.cours },
          update: {},
          create: { sectionId: SECTION_ID, nom: c.cours },
        });
        coursIdParNom.set(c.cours, cours.id);
        nbCoursCrees++;
      }
      const coursId = coursIdParNom.get(c.cours)!;

      if (!coursDejaLies.has(coursId)) {
        await prisma.cohorteCours.upsert({
          where: { cohorteId_coursId: { cohorteId: cohorte.id, coursId } },
          update: {},
          create: { cohorteId: cohorte.id, coursId, ordre: ordre++ },
        });
        coursDejaLies.add(coursId);
      }

      const existante = await prisma.classe.findFirst({
        where: {
          cohorteId: cohorte.id,
          coursId,
          heureDebut: c.heureDebut,
          semestre: c.semestre,
          anneeScolaireId: anneeActive.id,
        },
      });
      if (!existante) {
        await prisma.classe.create({
          data: {
            cohorteId: cohorte.id,
            coursId,
            anneeScolaireId: anneeActive.id,
            semestre: c.semestre,
            heureDebut: c.heureDebut,
            heureFin: c.heureFin,
            salleId,
          },
        });
        nbClassesCreees++;
      }
    }
  }

  console.log(
    `[import-ei] ${nbCoursCrees} cours, ${nbCohortesCrees} cohortes (upsert), ${nbSallesCreees} salles, ${nbClassesCreees} classes créées.`,
  );
}

main()
  .catch((erreur) => {
    console.error(erreur);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
