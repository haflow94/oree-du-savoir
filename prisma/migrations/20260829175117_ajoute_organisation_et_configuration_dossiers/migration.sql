-- CreateEnum
CREATE TYPE "Sexe" AS ENUM ('F', 'M');

-- CreateEnum
CREATE TYPE "ModeleDossier" AS ENUM ('ADULTES', 'JEUNES');

-- AlterTable
ALTER TABLE "dossiers_annuels" ADD COLUMN     "niveauAdmission" TEXT;

-- AlterTable
ALTER TABLE "etudiants" ADD COLUMN     "niveauScolaire" TEXT,
ADD COLUMN     "sexe" "Sexe";

-- AlterTable
ALTER TABLE "responsables_legaux" ADD COLUMN     "codePostal" TEXT,
ADD COLUMN     "profession" TEXT,
ADD COLUMN     "telephoneProfessionnel" TEXT,
ADD COLUMN     "ville" TEXT;

-- AlterTable
ALTER TABLE "sections" ADD COLUMN     "modeleDossier" "ModeleDossier" NOT NULL DEFAULT 'ADULTES',
ADD COLUMN     "reglesSpecifiques" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "organisation" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "sousTitre" TEXT,
    "adresse" TEXT,
    "codePostal" TEXT,
    "ville" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "siret" TEXT,
    "naf" TEXT,
    "logoCheminRelatif" TEXT,
    "misAJourLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creneaux_section" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "jour" TEXT NOT NULL,
    "horaire" TEXT NOT NULL,
    "restriction" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "creneaux_section_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creneaux_section_sectionId_idx" ON "creneaux_section"("sectionId");

-- AddForeignKey
ALTER TABLE "creneaux_section" ADD CONSTRAINT "creneaux_section_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
