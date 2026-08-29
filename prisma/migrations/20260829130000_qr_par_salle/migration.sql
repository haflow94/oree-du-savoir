-- Troisième évolution du QR de présence : un QR permanent par SALLE plutôt
-- que par classe. "salles" devient un référentiel à part entière (portant
-- son propre qrToken permanent), et "classes.salle" (texte libre) migre
-- vers "classes.salleId" (FK). L'ancien "classes.qrToken" par classe
-- disparaît : le raccourci d'accès est désormais uniquement porté par la
-- salle.

-- CreateTable
CREATE TABLE "salles" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salles_nom_key" ON "salles"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "salles_qrToken_key" ON "salles"("qrToken");

-- Reprend chaque valeur distincte de l'ancien champ texte "classes.salle"
-- comme une salle à part entière, avant de basculer les classes vers la
-- relation : aucune salle déjà saisie n'est perdue dans la conversion.
INSERT INTO "salles" ("id", "nom", "qrToken")
SELECT gen_random_uuid()::text, "distinctes"."salle", gen_random_uuid()::text
FROM (SELECT DISTINCT "salle" FROM "classes" WHERE "salle" IS NOT NULL) AS "distinctes"("salle");

-- AlterTable
ALTER TABLE "classes" ADD COLUMN "salleId" TEXT;

-- Rattache chaque classe à la salle correspondante (par nom) avant de
-- supprimer l'ancien texte libre.
UPDATE "classes"
SET "salleId" = "salles"."id"
FROM "salles"
WHERE "classes"."salle" = "salles"."nom";

-- DropIndex
DROP INDEX "classes_qrToken_key";

-- AlterTable
ALTER TABLE "classes" DROP COLUMN "qrToken",
DROP COLUMN "salle";

-- CreateIndex
CREATE INDEX "classes_salleId_idx" ON "classes"("salleId");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_salleId_fkey" FOREIGN KEY ("salleId") REFERENCES "salles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
