// Jeu de données de démonstration : comptes, étudiants, classes, séances,
// présences, paiements et trésorerie plausibles, pour tester l'application
// et faire des démonstrations.
//
// DESTRUCTIF : efface toutes les données métier existantes avant d'insérer.
// Refuse de s'exécuter en production, sauf DEMO_SEED_FORCE=1 (à n'utiliser
// que sur une instance de démonstration jetable).
//
//   npm run db:seed:demo
//
// Les données sont déterministes (générateur pseudo-aléatoire à graine fixe)
// pour que deux exécutions donnent le même résultat.

// Charge .env pour l'exécution locale ; en conteneur les variables sont déjà
// dans l'environnement et dotenv ne les écrase pas.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/password";
import { datesDesSeances, normaliserDateUTC } from "../src/lib/presences";
import type { JourSemaine, StatutPresence } from "../src/generated/prisma/enums";
import { SECTIONS_REFERENCE } from "./sections-reference";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const MOT_DE_PASSE_DEMO = "DemoOree2026!";

/** Générateur déterministe (mulberry32) : mêmes données à chaque exécution. */
function creerAleatoire(graine: number) {
  let etat = graine;
  return () => {
    etat |= 0;
    etat = (etat + 0x6d2b79f5) | 0;
    let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const alea = creerAleatoire(20260817);

function choisir<T>(liste: readonly T[]): T {
  return liste[Math.floor(alea() * liste.length)];
}

function jour(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const COMPTES = [
  { email: "sabrina.bureau@oree.test", nom: "Haddad", prenom: "Sabrina", role: "BUREAU" as const },
  { email: "karim.admin@oree.test", nom: "Benali", prenom: "Karim", role: "ADMINISTRATION" as const },
  { email: "fatima.accueil@oree.test", nom: "Moreau", prenom: "Fatima", role: "ACCUEIL" as const },
  { email: "yacine.tresorier@oree.test", nom: "Lemoine", prenom: "Yacine", role: "TRESORIER" as const },
  { email: "leila.nadir@oree.test", nom: "Nadir", prenom: "Leila", role: "ENSEIGNANT" as const },
  { email: "omar.cherif@oree.test", nom: "Cherif", prenom: "Omar", role: "ENSEIGNANT" as const },
  { email: "sofia.bensaid@oree.test", nom: "Bensaïd", prenom: "Sofia", role: "ENSEIGNANT" as const },
];

const ETUDIANTS = [
  { nom: "Amrani", prenom: "Sofia", naissance: "2011-03-12", ville: "Créteil" },
  { nom: "Bacha", prenom: "Idriss", naissance: "2010-07-22", ville: "Paris" },
  { nom: "Belkacem", prenom: "Nour", naissance: "2012-01-30", ville: "Vitry-sur-Seine" },
  { nom: "Benhamou", prenom: "Adam", naissance: "2009-11-05", ville: "Créteil" },
  { nom: "Bernard", prenom: "Lucas", naissance: "2011-05-18", ville: "Alfortville" },
  { nom: "Boukhari", prenom: "Inès", naissance: "2010-09-14", ville: "Créteil" },
  { nom: "Chaouch", prenom: "Rayan", naissance: "2012-04-02", ville: "Maisons-Alfort" },
  { nom: "Cohen", prenom: "Maya", naissance: "2011-08-27", ville: "Paris" },
  { nom: "Dahmani", prenom: "Sarah", naissance: "2009-02-11", ville: "Créteil" },
  { nom: "Diallo", prenom: "Mamadou", naissance: "2010-12-19", ville: "Ivry-sur-Seine" },
  { nom: "El Amrani", prenom: "Yasmine", naissance: "2012-06-08", ville: "Créteil" },
  { nom: "Fauvel", prenom: "Camille", naissance: "2011-10-23", ville: "Alfortville" },
  { nom: "Gharbi", prenom: "Ismaël", naissance: "2010-03-16", ville: "Créteil" },
  { nom: "Haddadi", prenom: "Lina", naissance: "2011-12-01", ville: "Vitry-sur-Seine" },
  { nom: "Kaci", prenom: "Sami", naissance: "2009-05-29", ville: "Créteil" },
  { nom: "Lahlou", prenom: "Amina", naissance: "2012-02-14", ville: "Maisons-Alfort" },
  { nom: "Mansouri", prenom: "Bilal", naissance: "2010-08-09", ville: "Créteil" },
  { nom: "Martin", prenom: "Léa", naissance: "2011-04-25", ville: "Paris" },
  { nom: "Nait", prenom: "Sofiane", naissance: "2009-09-30", ville: "Ivry-sur-Seine" },
  { nom: "Ouali", prenom: "Meriem", naissance: "2012-07-17", ville: "Créteil" },
  { nom: "Rahmani", prenom: "Anis", naissance: "2010-11-11", ville: "Alfortville" },
  { nom: "Saïdi", prenom: "Nadia", naissance: "2011-01-07", ville: "Créteil" },
  { nom: "Tahiri", prenom: "Walid", naissance: "2009-06-21", ville: "Créteil" },
  { nom: "Toure", prenom: "Aïcha", naissance: "2012-09-03", ville: "Vitry-sur-Seine" },
  // Deux majeurs : ils ne doivent pas avoir de responsable légal.
  { nom: "Ziani", prenom: "Farid", naissance: "1998-02-19", ville: "Créteil", majeur: true },
  { nom: "Abadi", prenom: "Souad", naissance: "1995-10-08", ville: "Paris", majeur: true },
];

const LIENS = ["Père", "Mère", "Tuteur"] as const;
const BANQUES = ["Crédit Mutuel", "BNP Paribas", "Société Générale", "La Banque Postale", "Caisse d'Épargne"];

async function viderDonneesMetier() {
  // Ordre imposé par les clés étrangères.
  await prisma.presence.deleteMany();
  await prisma.seance.deleteMany();
  await prisma.inscriptionClasse.deleteMany();
  await prisma.classeEnseignant.deleteMany();
  await prisma.classe.deleteMany();
  await prisma.cours.deleteMany();
  await prisma.cheque.deleteMany();
  await prisma.paiement.deleteMany();
  await prisma.echeance.deleteMany();
  await prisma.dossierAnnuel.deleteMany();
  await prisma.mouvementTresorerie.deleteMany();
  await prisma.categorieMouvement.deleteMany();
  await prisma.responsableLegal.deleteMany();
  await prisma.etudiant.deleteMany();
  await prisma.periodeFermeture.deleteMany();
  await prisma.journalAudit.deleteMany();
  await prisma.session.deleteMany();
  // Les comptes de démonstration seulement : le compte admin issu de
  // ADMIN_EMAIL est conservé, c'est le seul accès garanti.
  await prisma.utilisateur.deleteMany({ where: { email: { endsWith: "@oree.test" } } });
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.DEMO_SEED_FORCE !== "1") {
    throw new Error(
      "Refus d'insérer des données de démonstration en production. " +
        "Utilisez DEMO_SEED_FORCE=1 uniquement sur une instance jetable.",
    );
  }

  console.log("[demo] Nettoyage des données métier existantes…");
  await viderDonneesMetier();

  // --- Sections -------------------------------------------------------------
  // Référentiel stable (tarification officielle) : jamais vidé par le
  // nettoyage ci-dessus, seulement complété s'il manque une section.
  for (const section of SECTIONS_REFERENCE) {
    await prisma.section.upsert({
      where: { nom: section.nom },
      create: section,
      update: {},
    });
  }

  // --- Année scolaire -----------------------------------------------------
  // On couvre la date du jour pour que la démonstration ait des séances
  // passées (avec présences) et une séance à faire aujourd'hui.
  const aujourdhui = normaliserDateUTC(new Date());
  const debutAnnee = jour("2025-09-01");
  const finAnnee = jour("2026-08-31");

  await prisma.anneeScolaire.updateMany({ data: { active: false } });
  const annee = await prisma.anneeScolaire.upsert({
    where: { libelle: "2025/2026" },
    create: { libelle: "2025/2026", dateDebut: debutAnnee, dateFin: finAnnee, active: true },
    update: { dateDebut: debutAnnee, dateFin: finAnnee, active: true },
  });
  console.log(`[demo] Année scolaire ${annee.libelle} active.`);

  // --- Vacances -----------------------------------------------------------
  const fermetures = [
    { libelle: "Vacances de la Toussaint", dateDebut: jour("2025-10-18"), dateFin: jour("2025-11-02") },
    { libelle: "Vacances de Noël", dateDebut: jour("2025-12-20"), dateFin: jour("2026-01-04") },
    { libelle: "Vacances d'hiver", dateDebut: jour("2026-02-14"), dateFin: jour("2026-03-01") },
    { libelle: "Vacances de printemps", dateDebut: jour("2026-04-11"), dateFin: jour("2026-04-26") },
  ];
  await prisma.periodeFermeture.createMany({
    data: fermetures.map((f) => ({ ...f, anneeScolaireId: annee.id })),
  });
  console.log(`[demo] ${fermetures.length} périodes de fermeture.`);

  // --- Comptes ------------------------------------------------------------
  const hash = await hashPassword(MOT_DE_PASSE_DEMO);
  const comptes = await Promise.all(
    COMPTES.map((c) =>
      prisma.utilisateur.create({ data: { ...c, motDePasseHash: hash } }),
    ),
  );
  const enseignants = comptes.filter((c) => c.role === "ENSEIGNANT");
  console.log(`[demo] ${comptes.length} comptes (mot de passe : ${MOT_DE_PASSE_DEMO}).`);

  // --- Cours et classes ---------------------------------------------------
  const definitions = [
    { cours: "Arabe", section: "Langue Arabe", classes: [
      { niveau: "Débutant", jour: "SAMEDI", debut: "09:00", fin: "10:15", salle: "A1" },
      { niveau: "Intermédiaire", jour: "SAMEDI", debut: "10:30", fin: "11:45", salle: "A1" },
      { niveau: "Avancé", jour: "DIMANCHE", debut: "09:00", fin: "10:15", salle: "A2" },
    ]},
    { cours: "Coran", section: "Études Coraniques", classes: [
      { niveau: "Niveau 1", jour: "SAMEDI", debut: "12:00", fin: "13:15", salle: "B1" },
      { niveau: "Niveau 2", jour: "DIMANCHE", debut: "10:30", fin: "11:45", salle: "B1" },
    ]},
    { cours: "Soutien scolaire", section: "Jeunes", classes: [
      // Une classe en semaine : garantit une séance les jours ouvrés.
      { niveau: "Collège", jour: "LUNDI", debut: "17:30", fin: "19:00", salle: "C3" },
      { niveau: "Primaire", jour: "MERCREDI", debut: "14:00", fin: "15:30", salle: "C3" },
    ]},
  ] as const;

  const sections = await prisma.section.findMany();
  const sectionIdParNom = new Map(sections.map((s) => [s.nom, s.id]));

  const classesCreees: Array<{ id: string; jour: JourSemaine }> = [];
  // Répartition en tourniquet plutôt qu'au hasard : chaque enseignant a des
  // classes, sinon se connecter avec certains comptes ne montrerait rien.
  let indexEnseignant = 0;
  for (const def of definitions) {
    const sectionId = sectionIdParNom.get(def.section);
    if (!sectionId) throw new Error(`Section inconnue : ${def.section}`);
    const cours = await prisma.cours.create({ data: { nom: def.cours, sectionId } });
    for (const c of def.classes) {
      const titulaire = enseignants[indexEnseignant % enseignants.length];
      indexEnseignant += 1;
      const classe = await prisma.classe.create({
        data: {
          coursId: cours.id,
          anneeScolaireId: annee.id,
          niveau: c.niveau,
          jour: c.jour,
          heureDebut: c.debut,
          heureFin: c.fin,
          salle: c.salle,
          enseignants: { create: [{ utilisateurId: titulaire.id }] },
        },
      });
      classesCreees.push({ id: classe.id, jour: c.jour });
    }
  }
  console.log(`[demo] ${definitions.length} cours, ${classesCreees.length} classes.`);

  // --- Étudiants et responsables -----------------------------------------
  const etudiants = [];
  for (const e of ETUDIANTS) {
    const majeur = "majeur" in e && e.majeur === true;
    const etudiant = await prisma.etudiant.create({
      data: {
        nom: e.nom,
        prenom: e.prenom,
        dateNaissance: jour(e.naissance),
        villeNaissance: e.ville,
        civilite: alea() > 0.5 ? "M" : "MME",
        email: `${e.prenom}.${e.nom}@example.test`
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9.@]/g, ""),
        telephoneMobile: `06${String(Math.floor(alea() * 100000000)).padStart(8, "0")}`,
        adresse: `${1 + Math.floor(alea() * 80)} rue des Écoles`,
        // Les majeurs n'ont pas de responsable légal.
        ...(majeur
          ? { profession: choisir(["Étudiant", "Employé", "Sans emploi"]), niveauEtudes: "Bac+2" }
          : {
              responsables: {
                create: [
                  {
                    nom: e.nom,
                    prenom: choisir(["Mohamed", "Nadia", "Rachid", "Samira", "Ali", "Khadija"]),
                    lien: choisir(LIENS),
                    telephone: `06${String(Math.floor(alea() * 100000000)).padStart(8, "0")}`,
                    email: `parent.${e.nom.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}@example.test`,
                  },
                ],
              },
            }),
      },
    });
    etudiants.push(etudiant);
  }
  console.log(`[demo] ${etudiants.length} étudiants (dont 2 majeurs sans responsable).`);

  // --- Inscriptions aux classes ------------------------------------------
  let nbInscriptions = 0;
  for (const etudiant of etudiants) {
    // Un à trois cours par étudiant (règle métier : multi-cours autorisé).
    const nb = 1 + Math.floor(alea() * 3);
    const melange = [...classesCreees].sort(() => alea() - 0.5).slice(0, nb);
    for (const classe of melange) {
      await prisma.inscriptionClasse.create({
        data: { etudiantId: etudiant.id, classeId: classe.id },
      });
      nbInscriptions += 1;
    }
  }
  console.log(`[demo] ${nbInscriptions} inscriptions en classe.`);

  // --- Séances ------------------------------------------------------------
  let nbSeances = 0;
  for (const classe of classesCreees) {
    const dates = datesDesSeances(classe.jour, debutAnnee, finAnnee, fermetures);
    await prisma.seance.createMany({
      data: dates.map((date) => ({ classeId: classe.id, date })),
      skipDuplicates: true,
    });
    nbSeances += dates.length;
  }
  console.log(`[demo] ${nbSeances} séances générées (vacances exclues).`);

  // --- Présences sur les séances passées ---------------------------------
  // On ne remplit que le passé : la séance du jour reste à faire, pour
  // pouvoir dérouler le parcours d'appel en démonstration.
  const seancesPassees = await prisma.seance.findMany({
    where: { date: { lt: aujourdhui } },
    include: { classe: { include: { inscriptions: true } } },
    orderBy: { date: "desc" },
    take: 60, // les deux derniers mois environ, suffisant pour la démo
  });

  const STATUTS: StatutPresence[] = [
    "PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT",
    "PRESENT", "PRESENT", "PRESENT", "RETARD", "ABSENT",
    "ABSENT_EXCUSE", "RETARD_EXCUSE",
  ];

  let nbPresences = 0;
  let nbValidees = 0;
  for (const seance of seancesPassees) {
    if (seance.classe.inscriptions.length === 0) continue;
    // Quelques séances restent non validées : cas réel que l'application
    // doit savoir afficher (relance des présences non validées).
    if (alea() < 0.12) continue;

    await prisma.presence.createMany({
      data: seance.classe.inscriptions.map((i) => ({
        seanceId: seance.id,
        etudiantId: i.etudiantId,
        statut: choisir(STATUTS),
      })),
      skipDuplicates: true,
    });
    await prisma.seance.update({
      where: { id: seance.id },
      data: {
        statut: "VALIDEE",
        valideeLe: seance.date,
        valideeParId: choisir(enseignants).id,
        saisieViaPapier: alea() < 0.15,
      },
    });
    nbPresences += seance.classe.inscriptions.length;
    nbValidees += 1;
  }
  console.log(`[demo] ${nbValidees} séances validées, ${nbPresences} présences.`);

  // Une séance annulée, pour illustrer le cas.
  const aAnnuler = await prisma.seance.findFirst({
    where: { date: { gt: aujourdhui }, statut: "PREVUE" },
    orderBy: { date: "asc" },
  });
  if (aAnnuler) {
    await prisma.seance.update({
      where: { id: aAnnuler.id },
      data: { statut: "ANNULEE", motifAnnulation: "Enseignant absent" },
    });
  }

  // --- Dossiers annuels, échéances, paiements ----------------------------
  let nbPaiements = 0;
  for (const etudiant of etudiants) {
    const nbCours = await prisma.inscriptionClasse.count({
      where: { etudiantId: etudiant.id },
    });
    // Montant plausible : cotisation + un forfait par cours suivi.
    const montantDu = 60 + nbCours * 120;

    const dossier = await prisma.dossierAnnuel.create({
      data: { etudiantId: etudiant.id, anneeScolaireId: annee.id, montantDu },
    });

    // Échéancier en trois fois, usage courant de l'association.
    const parts = [
      { libelle: "1re échéance", date: jour("2025-09-15") },
      { libelle: "2e échéance", date: jour("2026-01-15") },
      { libelle: "3e échéance", date: jour("2026-04-15") },
    ];
    const montantEcheance = Math.round((montantDu / 3) * 100) / 100;

    // Répartition volontairement variée : soldé, partiel, impayé.
    const tirage = alea();
    const echeancesPayees = tirage < 0.5 ? 3 : tirage < 0.85 ? 1 + Math.floor(alea() * 2) : 0;

    for (const [index, part] of parts.entries()) {
      const echeance = await prisma.echeance.create({
        data: {
          dossierAnnuelId: dossier.id,
          libelle: part.libelle,
          montant: montantEcheance,
          dateEcheance: part.date,
        },
      });

      if (index < echeancesPayees) {
        const moyen = choisir(["CHEQUE", "CHEQUE", "ESPECES", "VIREMENT", "CB"] as const);
        const paiement = await prisma.paiement.create({
          data: {
            echeanceId: echeance.id,
            montant: montantEcheance,
            moyen,
            datePaiement: part.date,
          },
        });
        if (moyen === "CHEQUE") {
          const r = alea();
          const statut = r < 0.7 ? "ENCAISSE" : r < 0.9 ? "DEPOSE" : r < 0.97 ? "RECU" : "REJETE";
          await prisma.cheque.create({
            data: {
              paiementId: paiement.id,
              banque: choisir(BANQUES),
              numero: String(1000000 + Math.floor(alea() * 8999999)),
              titulaire: `${etudiant.prenom} ${etudiant.nom}`,
              statut,
              dateDepot: statut === "RECU" ? null : part.date,
              dateEncaissement: statut === "ENCAISSE" ? part.date : null,
              motifRejet: statut === "REJETE" ? "Provision insuffisante" : null,
            },
          });
        }
        nbPaiements += 1;
      }
    }
  }
  console.log(`[demo] ${etudiants.length} dossiers annuels, ${nbPaiements} paiements.`);

  // --- Trésorerie ---------------------------------------------------------
  const categories = await Promise.all(
    ["Cotisations", "Dons", "Loyer", "Fournitures", "Salaires", "Événements", "Frais bancaires"].map(
      (nom) => prisma.categorieMouvement.create({ data: { nom } }),
    ),
  );
  const parNom = new Map(categories.map((c) => [c.nom, c.id]));

  const mouvements: Array<{
    date: Date; libelle: string; type: "RECETTE" | "DEPENSE";
    moyen: "ESPECES" | "CHEQUE" | "VIREMENT" | "CB"; montant: number; categorie: string;
  }> = [];

  // Report de trésorerie de l'exercice précédent : sans lui l'association
  // démarrerait l'année à zéro, ce qui n'arrive pas en pratique.
  mouvements.push({
    date: jour("2025-09-01"), libelle: "Report de l'exercice précédent",
    type: "RECETTE", moyen: "VIREMENT", montant: 8400, categorie: "Cotisations",
  });

  // Un an de mouvements récurrents plausibles. Les recettes couvrent les
  // charges : une association qui perdrait 1 000 € par mois ne tiendrait pas
  // l'année, et le solde négatif rendrait la démonstration trompeuse.
  for (let m = 0; m < 12; m += 1) {
    const mois = new Date(Date.UTC(2025, 8 + m, 5));
    if (mois > aujourdhui) break;
    mouvements.push(
      { date: mois, libelle: "Loyer du local", type: "DEPENSE", moyen: "VIREMENT", montant: 850, categorie: "Loyer" },
      { date: new Date(Date.UTC(2025, 8 + m, 28)), libelle: "Rémunération enseignants", type: "DEPENSE", moyen: "VIREMENT", montant: 1200, categorie: "Salaires" },
      { date: new Date(Date.UTC(2025, 8 + m, 12)), libelle: "Encaissement cotisations", type: "RECETTE", moyen: "CHEQUE", montant: 2300 + Math.floor(alea() * 700), categorie: "Cotisations" },
    );
  }
  mouvements.push(
    { date: jour("2025-09-20"), libelle: "Achat de manuels", type: "DEPENSE", moyen: "CB", montant: 430.5, categorie: "Fournitures" },
    { date: jour("2025-10-04"), libelle: "Subvention municipale", type: "RECETTE", moyen: "VIREMENT", montant: 3000, categorie: "Dons" },
    { date: jour("2025-11-08"), libelle: "Don d'un adhérent", type: "RECETTE", moyen: "VIREMENT", montant: 500, categorie: "Dons" },
    { date: jour("2025-12-13"), libelle: "Vente kermesse d'hiver", type: "RECETTE", moyen: "ESPECES", montant: 1240, categorie: "Événements" },
    { date: jour("2026-01-31"), libelle: "Frais de tenue de compte", type: "DEPENSE", moyen: "VIREMENT", montant: 24, categorie: "Frais bancaires" },
    { date: jour("2026-03-07"), libelle: "Achat de fournitures", type: "DEPENSE", moyen: "CB", montant: 187.9, categorie: "Fournitures" },
    { date: jour("2026-05-16"), libelle: "Don entreprise locale", type: "RECETTE", moyen: "CHEQUE", montant: 750, categorie: "Dons" },
  );

  await prisma.mouvementTresorerie.createMany({
    data: mouvements
      .filter((m) => m.date <= aujourdhui)
      .map((m) => ({
        date: m.date,
        libelle: m.libelle,
        type: m.type,
        moyen: m.moyen,
        montant: m.montant,
        categorieId: parNom.get(m.categorie) ?? null,
      })),
  });
  console.log(`[demo] ${categories.length} catégories, ${mouvements.length} mouvements de trésorerie.`);

  console.log("\n[demo] Terminé. Connexion avec l'un des comptes :");
  for (const c of COMPTES) {
    console.log(`  ${c.role.padEnd(15)} ${c.email}`);
  }
  console.log(`  Mot de passe commun : ${MOT_DE_PASSE_DEMO}`);
}

main()
  .catch((error) => {
    console.error("[demo] Échec :", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
