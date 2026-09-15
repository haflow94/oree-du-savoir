-- CreateEnum
CREATE TYPE "CatalogueNiveaux" AS ENUM ('AUCUN', 'DEBUTANT_INTERMEDIAIRE', 'ANNEES_1_A_5');

-- AlterTable
ALTER TABLE "sections" ADD COLUMN     "catalogueNiveaux" "CatalogueNiveaux" NOT NULL DEFAULT 'AUCUN';

-- Backfill : une base existante a déjà ses 4 sections de référence créées
-- par seedSections avant l'introduction de cette colonne (défaut AUCUN pour
-- toute ligne préexistante, comme pour modeleDossier — voir la migration
-- 20260829175200_backfill_modele_dossier_jeunes). Une base neuve n'est pas
-- concernée : le seed crée directement les sections avec leur
-- catalogueNiveaux correct (voir prisma/sections-reference.ts). Idempotent.
UPDATE "sections" SET "catalogueNiveaux" = 'DEBUTANT_INTERMEDIAIRE' WHERE "nom" IN ('Langue Arabe', 'Études Coraniques');
UPDATE "sections" SET "catalogueNiveaux" = 'ANNEES_1_A_5' WHERE "nom" = 'Études Islamiques';
