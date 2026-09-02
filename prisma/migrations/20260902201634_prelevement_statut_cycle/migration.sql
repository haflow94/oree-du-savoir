/*
  Warnings:

  - You are about to drop the column `rejete` on the `prelevements` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "StatutPrelevement" AS ENUM ('EMIS', 'ENCAISSE', 'REJETE');

-- AlterTable
ALTER TABLE "prelevements"
ADD COLUMN     "dateEncaissement" TIMESTAMP(3),
ADD COLUMN     "statut" "StatutPrelevement" NOT NULL DEFAULT 'EMIS';

-- Reprend les prélèvements déjà marqués rejetés avant de perdre la colonne
-- booléenne, pour ne pas faire disparaître un incident déjà signalé.
UPDATE "prelevements" SET "statut" = 'REJETE' WHERE "rejete" = true;

ALTER TABLE "prelevements" DROP COLUMN "rejete";
