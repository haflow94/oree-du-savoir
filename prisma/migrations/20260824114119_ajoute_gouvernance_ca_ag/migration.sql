-- CreateEnum
CREATE TYPE "TypeReunionGouvernance" AS ENUM ('CA', 'AG');

-- CreateEnum
CREATE TYPE "TypeDocumentAssociation" AS ENUM ('PV', 'REGLEMENT_INTERIEUR', 'STATUTS', 'AUTRE');

-- AlterEnum
ALTER TYPE "Module" ADD VALUE 'GOUVERNANCE';

-- CreateTable
CREATE TABLE "membres_ca" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "fonction" TEXT,
    "email" TEXT,
    "dateEntree" TIMESTAMP(3) NOT NULL,
    "dateSortie" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membres_ca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reunions_gouvernance" (
    "id" TEXT NOT NULL,
    "type" "TypeReunionGouvernance" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "ordreDuJour" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reunions_gouvernance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents_association" (
    "id" TEXT NOT NULL,
    "type" "TypeDocumentAssociation" NOT NULL,
    "nomFichier" TEXT NOT NULL,
    "cheminRelatif" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tailleOctets" INTEGER NOT NULL,
    "reunionId" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creeParId" TEXT,

    CONSTRAINT "documents_association_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reunions_gouvernance_date_idx" ON "reunions_gouvernance"("date");

-- CreateIndex
CREATE INDEX "documents_association_reunionId_idx" ON "documents_association"("reunionId");

-- AddForeignKey
ALTER TABLE "documents_association" ADD CONSTRAINT "documents_association_reunionId_fkey" FOREIGN KEY ("reunionId") REFERENCES "reunions_gouvernance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents_association" ADD CONSTRAINT "documents_association_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
