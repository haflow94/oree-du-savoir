-- AlterTable
ALTER TABLE "prelevements" ADD COLUMN     "motifRejet" TEXT,
ADD COLUMN     "rejete" BOOLEAN NOT NULL DEFAULT false;
