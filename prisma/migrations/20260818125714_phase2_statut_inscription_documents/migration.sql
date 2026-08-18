-- CreateEnum
CREATE TYPE "StatutInscription" AS ENUM ('PREINSCRIT', 'VALIDE');

-- CreateEnum
CREATE TYPE "TypeDocument" AS ENUM ('PIECE_IDENTITE', 'PHOTO', 'DOSSIER_GENERE', 'DOSSIER_SIGNE', 'JUSTIFICATIF_PAIEMENT', 'AUTRE');

-- AlterTable
ALTER TABLE "etudiants" ADD COLUMN     "statutInscription" "StatutInscription" NOT NULL DEFAULT 'VALIDE';

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "type" "TypeDocument" NOT NULL,
    "nomFichier" TEXT NOT NULL,
    "cheminRelatif" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tailleOctets" INTEGER NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creeParId" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_etudiantId_idx" ON "documents"("etudiantId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_etudiantId_fkey" FOREIGN KEY ("etudiantId") REFERENCES "etudiants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
