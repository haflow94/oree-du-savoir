// Script de seed idempotent, exécuté au démarrage du conteneur (voir
// entrypoint.sh) et utilisable en local via `npm run db:seed`.
// Ne fait jamais que compléter : il ne réinitialise jamais un mot de passe
// existant ni ne duplique de données.

// Charge .env pour l'exécution locale (`npm run db:seed`) ; en conteneur les
// variables sont déjà dans l'environnement et dotenv ne les écrase pas.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { Role, Module, NiveauAcces } from "../src/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/password";
import { SECTIONS_REFERENCE } from "./sections-reference";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const motDePasse = process.env.ADMIN_PASSWORD;
  const nom = process.env.ADMIN_NOM ?? "Administrateur";
  const prenom = process.env.ADMIN_PRENOM ?? "Compte";

  if (!email || !motDePasse) {
    throw new Error(
      "ADMIN_EMAIL et ADMIN_PASSWORD doivent être définis pour le seed.",
    );
  }

  const existant = await prisma.utilisateur.findUnique({ where: { email } });
  if (existant) {
    console.log(`[seed] Utilisateur ${email} déjà présent — inchangé.`);
    return;
  }

  const motDePasseHash = await hashPassword(motDePasse);
  await prisma.utilisateur.create({
    data: { email, motDePasseHash, nom, prenom, role: "BUREAU", actif: true },
  });
  console.log(`[seed] Compte Bureau initial créé : ${email}`);
}

async function seedAnneeScolaire() {
  const count = await prisma.anneeScolaire.count();
  if (count > 0) {
    console.log("[seed] Année scolaire déjà présente — inchangé.");
    return;
  }

  const now = new Date();
  // Rentrée associative considérée en septembre.
  const anneeDebut = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const libelle = `${anneeDebut}/${anneeDebut + 1}`;

  await prisma.anneeScolaire.create({
    data: {
      libelle,
      dateDebut: new Date(Date.UTC(anneeDebut, 8, 1)),
      dateFin: new Date(Date.UTC(anneeDebut + 1, 7, 31)),
      active: true,
    },
  });
  console.log(`[seed] Année scolaire ${libelle} créée et activée.`);
}

// Ne crée que les sections manquantes : une fois créée, une section peut être
// ajustée manuellement (tarif révisé, etc.) sans être écrasée au redémarrage.
async function seedSections() {
  let creees = 0;
  for (const section of SECTIONS_REFERENCE) {
    const existante = await prisma.section.findUnique({ where: { nom: section.nom } });
    if (existante) continue;
    await prisma.section.create({ data: section });
    creees += 1;
  }
  console.log(`[seed] ${creees} section(s) créée(s) (${SECTIONS_REFERENCE.length} au total).`);
}

// Matrice de permissions initiale (grille rôle × module — voir
// lib/permissions.ts). Seules les combinaisons LECTURE/ECRITURE sont
// listées : une combinaison absente vaut AUCUN accès par défaut (voir le
// fallback `?? "AUCUN"` de niveauAcces()), pas besoin de la seeder.
const MATRICE_INITIALE: { role: Role; module: Module; niveau: NiveauAcces }[] = [
  // Bureau et Trésorier : accès complet à tous les modules métier (le
  // Trésorier fait partie du Bureau, décision actée avec l'association).
  // BUREAU n'est jamais lu à l'exécution (court-circuité dans
  // lib/permissions.ts) — seedé uniquement pour l'affichage de la grille.
  ...Object.values(Module).flatMap((module) => [
    { role: Role.BUREAU, module, niveau: NiveauAcces.ECRITURE },
    { role: Role.TRESORIER, module, niveau: NiveauAcces.ECRITURE },
  ]),

  // Administration : mêmes droits opérationnels que Bureau sur le métier
  // courant, sauf Trésorerie (aucun accès) et lecture seule sur
  // Activités/Paiements.
  { role: Role.ADMINISTRATION, module: Module.ETUDIANTS, niveau: NiveauAcces.ECRITURE },
  { role: Role.ADMINISTRATION, module: Module.CLASSES, niveau: NiveauAcces.ECRITURE },
  { role: Role.ADMINISTRATION, module: Module.PRESENCES, niveau: NiveauAcces.ECRITURE },
  { role: Role.ADMINISTRATION, module: Module.ACTIVITES, niveau: NiveauAcces.LECTURE },
  { role: Role.ADMINISTRATION, module: Module.PAIEMENTS, niveau: NiveauAcces.LECTURE },
  { role: Role.ADMINISTRATION, module: Module.ADMINISTRATION, niveau: NiveauAcces.ECRITURE },
  { role: Role.ADMINISTRATION, module: Module.DOCUMENTS, niveau: NiveauAcces.ECRITURE },
  { role: Role.ADMINISTRATION, module: Module.INSCRIPTIONS, niveau: NiveauAcces.ECRITURE },
  { role: Role.ADMINISTRATION, module: Module.CALENDRIER, niveau: NiveauAcces.ECRITURE },

  // Accueil : rôle de guichet (étudiants + présences en écriture), lecture
  // seule sur le reste du métier, aucun accès Trésorerie/Administration.
  { role: Role.ACCUEIL, module: Module.ETUDIANTS, niveau: NiveauAcces.ECRITURE },
  { role: Role.ACCUEIL, module: Module.CLASSES, niveau: NiveauAcces.LECTURE },
  { role: Role.ACCUEIL, module: Module.PRESENCES, niveau: NiveauAcces.ECRITURE },
  { role: Role.ACCUEIL, module: Module.ACTIVITES, niveau: NiveauAcces.LECTURE },
  { role: Role.ACCUEIL, module: Module.PAIEMENTS, niveau: NiveauAcces.LECTURE },
  { role: Role.ACCUEIL, module: Module.DOCUMENTS, niveau: NiveauAcces.ECRITURE },
  { role: Role.ACCUEIL, module: Module.INSCRIPTIONS, niveau: NiveauAcces.ECRITURE },
  { role: Role.ACCUEIL, module: Module.CALENDRIER, niveau: NiveauAcces.LECTURE },

  // Enseignant : uniquement la validation de présence sur ses propres
  // classes assignées (scoping peutAccederClasse, conservé par ailleurs).
  { role: Role.ENSEIGNANT, module: Module.PRESENCES, niveau: NiveauAcces.ECRITURE },

  // Responsable d'activités : cloisonné à Activités + Calendrier (les
  // activités y apparaissent), rien d'autre.
  { role: Role.ACTIVITE, module: Module.ACTIVITES, niveau: NiveauAcces.ECRITURE },
  { role: Role.ACTIVITE, module: Module.CALENDRIER, niveau: NiveauAcces.ECRITURE },
];

// N'insère que les combinaisons manquantes : un ajustement fait en prod par
// le Bureau depuis Administration → Permissions n'est jamais réinitialisé au
// redémarrage du conteneur (seed.ts tourne à chaque démarrage).
async function seedPermissions() {
  let creees = 0;
  for (const { role, module, niveau } of MATRICE_INITIALE) {
    const existante = await prisma.permissionRole.findUnique({
      where: { role_module: { role, module } },
    });
    if (existante) continue;
    await prisma.permissionRole.create({ data: { role, module, niveau } });
    creees += 1;
  }
  console.log(`[seed] ${creees} permission(s) créée(s) (${MATRICE_INITIALE.length} au total).`);
}

async function main() {
  await seedAdmin();
  await seedAnneeScolaire();
  await seedSections();
  await seedPermissions();
}

main()
  .catch((error) => {
    console.error("[seed] Échec du seed :", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
