-- AlterTable
ALTER TABLE "etudiants" ADD COLUMN     "doublonPotentielId" TEXT;

-- CreateIndex
CREATE INDEX "etudiants_doublonPotentielId_idx" ON "etudiants"("doublonPotentielId");

-- AddForeignKey
ALTER TABLE "etudiants" ADD CONSTRAINT "etudiants_doublonPotentielId_fkey" FOREIGN KEY ("doublonPotentielId") REFERENCES "etudiants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
