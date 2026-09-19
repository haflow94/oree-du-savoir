-- AlterEnum
ALTER TYPE "MoyenPaiement" ADD VALUE 'VIREMENT_HELLOASSO';
ALTER TYPE "MoyenPaiement" ADD VALUE 'PRELEVEMENT_HELLOASSO';

-- AlterTable
ALTER TABLE "paiements" ADD COLUMN     "referenceHelloAsso" TEXT;
