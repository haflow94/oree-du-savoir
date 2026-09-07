-- AlterTable
ALTER TABLE "codes_preinscription" DROP COLUMN "usageUnique",
ADD COLUMN     "estAccueilAuto" BOOLEAN NOT NULL DEFAULT false;
