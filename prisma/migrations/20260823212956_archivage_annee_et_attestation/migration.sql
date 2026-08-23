-- AlterEnum
ALTER TYPE "TypeDocument" ADD VALUE 'ATTESTATION_SCOLARITE';

-- AlterTable
ALTER TABLE "annees_scolaires" ADD COLUMN     "archivee" BOOLEAN NOT NULL DEFAULT false;
