-- AlterTable
ALTER TABLE "dossiers_annuels" ADD COLUMN     "derniereRelanceEnvoyeeLe" TIMESTAMP(3),
ADD COLUMN     "nombreRelancesEnvoyees" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "parametres_relance" (
    "id" TEXT NOT NULL,
    "nombreMaxRelances" INTEGER NOT NULL DEFAULT 2,
    "delaiJours" INTEGER NOT NULL DEFAULT 15,
    "misAJourLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parametres_relance_pkey" PRIMARY KEY ("id")
);
