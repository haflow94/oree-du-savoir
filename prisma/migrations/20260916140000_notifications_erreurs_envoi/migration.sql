-- AlterTable
ALTER TABLE "etudiants" ADD COLUMN     "notificationBienvenueErreurLe" TIMESTAMP(3),
ADD COLUMN     "notificationBienvenueErreurMessage" TEXT;

-- AlterTable
ALTER TABLE "dossiers_annuels" ADD COLUMN     "derniereRelanceErreurLe" TIMESTAMP(3),
ADD COLUMN     "derniereRelanceErreurMessage" TEXT,
ADD COLUMN     "notificationVerificationErreurLe" TIMESTAMP(3),
ADD COLUMN     "notificationVerificationErreurMessage" TEXT,
ADD COLUMN     "notificationSignatureErreurLe" TIMESTAMP(3),
ADD COLUMN     "notificationSignatureErreurMessage" TEXT;
