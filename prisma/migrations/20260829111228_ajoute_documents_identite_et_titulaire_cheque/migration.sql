-- CreateEnum
CREATE TYPE "TypePieceIdentite" AS ENUM ('CARTE_IDENTITE', 'PASSEPORT', 'TITRE_SEJOUR', 'PERMIS_CONDUIRE', 'AUTRE');

-- AlterTable: nouvelles colonnes du titulaire de chèque, ancienne colonne
-- conservée le temps de la reprise de données ci-dessous.
ALTER TABLE "cheques" ADD COLUMN     "titulaireEstEtudiant" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "titulaireNom" TEXT,
ADD COLUMN     "titulairePrenom" TEXT;

-- Reprise des données existantes : l'ancien champ libre "titulaire"
-- (nom + prénom mélangés) est repris tel quel dans titulaireNom, pas de
-- découpage automatique risqué — à corriger à la main si besoin (voir
-- CLAUDE.md, ne jamais deviner une règle métier).
UPDATE "cheques" SET "titulaireNom" = "titulaire" WHERE "titulaire" IS NOT NULL;

ALTER TABLE "cheques" DROP COLUMN "titulaire";

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "chequeId" TEXT,
ADD COLUMN     "dateExpiration" DATE,
ADD COLUMN     "typePieceIdentite" "TypePieceIdentite";

-- CreateIndex
CREATE INDEX "documents_chequeId_idx" ON "documents"("chequeId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_chequeId_fkey" FOREIGN KEY ("chequeId") REFERENCES "cheques"("id") ON DELETE CASCADE ON UPDATE CASCADE;
