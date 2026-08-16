-- CreateEnum
CREATE TYPE "Civilite" AS ENUM ('M', 'MME');

-- CreateTable
CREATE TABLE "etudiants" (
    "id" TEXT NOT NULL,
    "civilite" "Civilite",
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "dateNaissance" TIMESTAMP(3),
    "villeNaissance" TEXT,
    "telephoneMobile" TEXT,
    "telephoneFixe" TEXT,
    "email" TEXT,
    "adresse" TEXT,
    "complementAdresse" TEXT,
    "profession" TEXT,
    "niveauEtudes" TEXT,
    "dernierDiplome" TEXT,
    "remarque" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "misAJourLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "etudiants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responsables_legaux" (
    "id" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "civilite" "Civilite",
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "lien" TEXT NOT NULL,
    "telephone" TEXT,
    "email" TEXT,
    "adresse" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responsables_legaux_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "etudiants_nom_prenom_idx" ON "etudiants"("nom", "prenom");

-- CreateIndex
CREATE INDEX "responsables_legaux_etudiantId_idx" ON "responsables_legaux"("etudiantId");

-- AddForeignKey
ALTER TABLE "responsables_legaux" ADD CONSTRAINT "responsables_legaux_etudiantId_fkey" FOREIGN KEY ("etudiantId") REFERENCES "etudiants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
