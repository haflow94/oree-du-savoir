-- CreateEnum
CREATE TYPE "StatutPlaceClasse" AS ENUM ('CONFIRMEE', 'LISTE_ATTENTE');

-- AlterTable
ALTER TABLE "inscriptions_classe" ADD COLUMN     "statut" "StatutPlaceClasse" NOT NULL DEFAULT 'CONFIRMEE';
