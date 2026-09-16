-- AlterTable
-- Remplace le couple SIRET/NAF par le numéro RNA sur l'identité de
-- l'association (décision associative) : les deux colonnes étaient vides en
-- base au moment de cette migration (jamais saisies depuis Administration →
-- Organisation), aucun backfill nécessaire.
ALTER TABLE "organisation" DROP COLUMN "siret";
ALTER TABLE "organisation" DROP COLUMN "naf";
ALTER TABLE "organisation" ADD COLUMN "rna" TEXT;
