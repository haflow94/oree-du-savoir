// Script de seed idempotent, exécuté au démarrage du conteneur (voir
// entrypoint.sh) et utilisable en local via `npm run db:seed`.
// Ne fait jamais que compléter : il ne réinitialise jamais un mot de passe
// existant ni ne duplique de données.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/password";

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

async function main() {
  await seedAdmin();
  await seedAnneeScolaire();
}

main()
  .catch((error) => {
    console.error("[seed] Échec du seed :", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
