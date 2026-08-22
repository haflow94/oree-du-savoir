-- CreateEnum
CREATE TYPE "FrequenceActivite" AS ENUM ('AUCUNE', 'QUOTIDIENNE', 'HEBDOMADAIRE', 'MENSUELLE');

-- AlterTable
ALTER TABLE "activites" ADD COLUMN     "dateFin" DATE,
ADD COLUMN     "dateFinRecurrence" DATE,
ADD COLUMN     "frequence" "FrequenceActivite" NOT NULL DEFAULT 'AUCUNE',
ADD COLUMN     "heureDebut" TEXT,
ADD COLUMN     "heureFin" TEXT,
ADD COLUMN     "serieId" TEXT;

-- CreateTable
CREATE TABLE "activite_responsables" (
    "activiteId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,

    CONSTRAINT "activite_responsables_pkey" PRIMARY KEY ("activiteId","utilisateurId")
);

-- CreateIndex
CREATE INDEX "activites_serieId_idx" ON "activites"("serieId");

-- AddForeignKey
ALTER TABLE "activite_responsables" ADD CONSTRAINT "activite_responsables_activiteId_fkey" FOREIGN KEY ("activiteId") REFERENCES "activites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activite_responsables" ADD CONSTRAINT "activite_responsables_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
