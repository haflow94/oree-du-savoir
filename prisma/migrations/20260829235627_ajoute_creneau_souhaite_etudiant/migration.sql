-- AlterTable
ALTER TABLE "etudiants" ADD COLUMN     "creneauSouhaiteId" TEXT;

-- AddForeignKey
ALTER TABLE "etudiants" ADD CONSTRAINT "etudiants_creneauSouhaiteId_fkey" FOREIGN KEY ("creneauSouhaiteId") REFERENCES "creneaux_section"("id") ON DELETE SET NULL ON UPDATE CASCADE;
