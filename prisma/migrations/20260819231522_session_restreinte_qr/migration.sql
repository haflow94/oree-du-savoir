-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "seanceRestreinteId" TEXT;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_seanceRestreinteId_fkey" FOREIGN KEY ("seanceRestreinteId") REFERENCES "seances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
