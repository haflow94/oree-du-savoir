-- CreateEnum
CREATE TYPE "StatutSeance" AS ENUM ('PREVUE', 'VALIDEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "StatutPresence" AS ENUM ('PRESENT', 'RETARD', 'RETARD_EXCUSE', 'ABSENT', 'ABSENT_EXCUSE');

-- AlterTable
-- Ajout en trois temps pour rester applicable sur une base contenant déjà
-- des classes : colonne nullable, backfill d'un jeton unique par classe,
-- puis passage en NOT NULL.
ALTER TABLE "classes" ADD COLUMN     "qrToken" TEXT;
UPDATE "classes" SET "qrToken" = gen_random_uuid()::text WHERE "qrToken" IS NULL;
ALTER TABLE "classes" ALTER COLUMN "qrToken" SET NOT NULL;

-- CreateTable
CREATE TABLE "periodes_fermeture" (
    "id" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "periodes_fermeture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscriptions_classe" (
    "id" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inscriptions_classe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seances" (
    "id" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "statut" "StatutSeance" NOT NULL DEFAULT 'PREVUE',
    "motifAnnulation" TEXT,
    "valideeLe" TIMESTAMP(3),
    "valideeParId" TEXT,
    "saisieViaPapier" BOOLEAN NOT NULL DEFAULT false,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presences" (
    "id" TEXT NOT NULL,
    "seanceId" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "statut" "StatutPresence" NOT NULL,
    "misAJourLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "periodes_fermeture_anneeScolaireId_idx" ON "periodes_fermeture"("anneeScolaireId");

-- CreateIndex
CREATE INDEX "inscriptions_classe_classeId_idx" ON "inscriptions_classe"("classeId");

-- CreateIndex
CREATE UNIQUE INDEX "inscriptions_classe_etudiantId_classeId_key" ON "inscriptions_classe"("etudiantId", "classeId");

-- CreateIndex
CREATE INDEX "seances_date_idx" ON "seances"("date");

-- CreateIndex
CREATE UNIQUE INDEX "seances_classeId_date_key" ON "seances"("classeId", "date");

-- CreateIndex
CREATE INDEX "presences_etudiantId_idx" ON "presences"("etudiantId");

-- CreateIndex
CREATE UNIQUE INDEX "presences_seanceId_etudiantId_key" ON "presences"("seanceId", "etudiantId");

-- CreateIndex
CREATE UNIQUE INDEX "classes_qrToken_key" ON "classes"("qrToken");

-- AddForeignKey
ALTER TABLE "periodes_fermeture" ADD CONSTRAINT "periodes_fermeture_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annees_scolaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscriptions_classe" ADD CONSTRAINT "inscriptions_classe_etudiantId_fkey" FOREIGN KEY ("etudiantId") REFERENCES "etudiants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscriptions_classe" ADD CONSTRAINT "inscriptions_classe_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seances" ADD CONSTRAINT "seances_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seances" ADD CONSTRAINT "seances_valideeParId_fkey" FOREIGN KEY ("valideeParId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presences" ADD CONSTRAINT "presences_seanceId_fkey" FOREIGN KEY ("seanceId") REFERENCES "seances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presences" ADD CONSTRAINT "presences_etudiantId_fkey" FOREIGN KEY ("etudiantId") REFERENCES "etudiants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

