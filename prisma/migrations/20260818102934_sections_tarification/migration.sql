-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "fraisFormation" DECIMAL(10,2) NOT NULL,
    "fraisDossier" DECIMAL(10,2) NOT NULL,
    "volumeHoraireAnnuel" INTEGER,
    "remboursementAvant15Jours" INTEGER NOT NULL,
    "remboursementAvant29Jours" INTEGER NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sections_nom_key" ON "sections"("nom");

-- Référentiel des 4 sections (voir prisma/sections-reference.ts).
INSERT INTO "sections" ("id", "nom", "fraisFormation", "fraisDossier", "volumeHoraireAnnuel", "remboursementAvant15Jours", "remboursementAvant29Jours")
VALUES
    ('section-jeunes', 'Jeunes', 420.00, 60.00, 93, 75, 50),
    ('section-langue-arabe', 'Langue Arabe', 490.00, 60.00, 120, 50, 25),
    ('section-etudes-coraniques', 'Études Coraniques', 440.00, 60.00, 120, 50, 25),
    ('section-etudes-islamiques', 'Études Islamiques', 520.00, 60.00, 120, 50, 25);

-- AlterTable (nullable pour permettre le backfill des lignes existantes)
ALTER TABLE "cours" ADD COLUMN "sectionId" TEXT;

-- Backfill des cours de démonstration déjà en base (mapping vers la section
-- réelle la plus proche du nom du cours) ; tout cours non reconnu retombe
-- sur "Jeunes" par défaut, à corriger manuellement si besoin.
UPDATE "cours" SET "sectionId" = 'section-langue-arabe' WHERE "nom" = 'Arabe';
UPDATE "cours" SET "sectionId" = 'section-etudes-coraniques' WHERE "nom" = 'Coran';
UPDATE "cours" SET "sectionId" = 'section-jeunes' WHERE "nom" = 'Soutien scolaire';
UPDATE "cours" SET "sectionId" = 'section-jeunes' WHERE "sectionId" IS NULL;

-- AlterTable
ALTER TABLE "cours" ALTER COLUMN "sectionId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "cours_sectionId_idx" ON "cours"("sectionId");

-- AddForeignKey
ALTER TABLE "cours" ADD CONSTRAINT "cours_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
