-- AlterTable
ALTER TABLE "cheques" ADD COLUMN     "derniereAlerteEnvoyeeLe" TIMESTAMP(3),
ADD COLUMN     "nombreAlertesEnvoyees" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "parametres_relance" ADD COLUMN     "delaiJoursCheque" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "nombreMaxAlertesCheque" INTEGER NOT NULL DEFAULT 2;
