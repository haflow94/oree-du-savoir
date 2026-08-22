-- AlterTable
ALTER TABLE "etudiants" ADD COLUMN     "sectionSouhaiteeId" TEXT;

-- AddForeignKey
ALTER TABLE "etudiants" ADD CONSTRAINT "etudiants_sectionSouhaiteeId_fkey" FOREIGN KEY ("sectionSouhaiteeId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
