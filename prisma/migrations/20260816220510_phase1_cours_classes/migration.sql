-- CreateEnum
CREATE TYPE "JourSemaine" AS ENUM ('LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE');

-- CreateTable
CREATE TABLE "cours" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "coursId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "niveau" TEXT,
    "semestre" TEXT,
    "jour" "JourSemaine" NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,
    "salle" TEXT,
    "capacite" INTEGER,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classe_enseignants" (
    "classeId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,

    CONSTRAINT "classe_enseignants_pkey" PRIMARY KEY ("classeId","utilisateurId")
);

-- CreateIndex
CREATE UNIQUE INDEX "cours_nom_key" ON "cours"("nom");

-- CreateIndex
CREATE INDEX "classes_anneeScolaireId_idx" ON "classes"("anneeScolaireId");

-- CreateIndex
CREATE INDEX "classes_coursId_idx" ON "classes"("coursId");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_coursId_fkey" FOREIGN KEY ("coursId") REFERENCES "cours"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annees_scolaires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classe_enseignants" ADD CONSTRAINT "classe_enseignants_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classe_enseignants" ADD CONSTRAINT "classe_enseignants_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
