-- CreateEnum
CREATE TYPE "StatutSignature" AS ENUM ('A_GENERER', 'A_VERIFIER', 'ENVOYEE_SIGNATURE', 'SIGNEE');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "dossierAnnuelId" TEXT,
ADD COLUMN     "numeroVersion" INTEGER;

-- AlterTable
ALTER TABLE "dossiers_annuels" ADD COLUMN     "documensoDocumentId" INTEGER,
ADD COLUMN     "envoyeSignatureLe" TIMESTAMP(3),
ADD COLUMN     "notificationVerificationEnvoyeeLe" TIMESTAMP(3),
ADD COLUMN     "signeLe" TIMESTAMP(3),
ADD COLUMN     "statutSignature" "StatutSignature" NOT NULL DEFAULT 'A_GENERER',
ADD COLUMN     "versionConfirmeeLe" TIMESTAMP(3),
ADD COLUMN     "versionConfirmeeNumero" INTEGER;

-- AlterTable
ALTER TABLE "etudiants" ADD COLUMN     "niveauDeclare" TEXT;

-- CreateTable
CREATE TABLE "acces_dossier" (
    "id" TEXT NOT NULL,
    "dossierAnnuelId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "revoqueLe" TIMESTAMP(3),
    "dernierAccesLe" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acces_dossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demandes_correction" (
    "id" TEXT NOT NULL,
    "dossierAnnuelId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traiteeLe" TIMESTAMP(3),
    "traiteeParId" TEXT,

    CONSTRAINT "demandes_correction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "acces_dossier_dossierAnnuelId_key" ON "acces_dossier"("dossierAnnuelId");

-- CreateIndex
CREATE UNIQUE INDEX "acces_dossier_tokenHash_key" ON "acces_dossier"("tokenHash");

-- CreateIndex
CREATE INDEX "demandes_correction_dossierAnnuelId_idx" ON "demandes_correction"("dossierAnnuelId");

-- CreateIndex
CREATE INDEX "documents_dossierAnnuelId_idx" ON "documents"("dossierAnnuelId");

-- CreateIndex
CREATE UNIQUE INDEX "dossiers_annuels_documensoDocumentId_key" ON "dossiers_annuels"("documensoDocumentId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_dossierAnnuelId_fkey" FOREIGN KEY ("dossierAnnuelId") REFERENCES "dossiers_annuels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acces_dossier" ADD CONSTRAINT "acces_dossier_dossierAnnuelId_fkey" FOREIGN KEY ("dossierAnnuelId") REFERENCES "dossiers_annuels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes_correction" ADD CONSTRAINT "demandes_correction_dossierAnnuelId_fkey" FOREIGN KEY ("dossierAnnuelId") REFERENCES "dossiers_annuels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes_correction" ADD CONSTRAINT "demandes_correction_traiteeParId_fkey" FOREIGN KEY ("traiteeParId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

