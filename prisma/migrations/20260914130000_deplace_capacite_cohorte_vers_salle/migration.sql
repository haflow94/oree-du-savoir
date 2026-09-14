-- AlterTable
ALTER TABLE "cohortes" DROP COLUMN "capaciteMax";

-- AlterTable
ALTER TABLE "salles" ADD COLUMN     "capaciteMax" INTEGER;
