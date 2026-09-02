-- AlterTable
ALTER TABLE "categories_mouvement" ADD COLUMN     "cle" TEXT;

-- AlterTable
ALTER TABLE "mouvements_tresorerie" ADD COLUMN     "paiementId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "categories_mouvement_cle_key" ON "categories_mouvement"("cle");

-- CreateIndex
CREATE UNIQUE INDEX "mouvements_tresorerie_paiementId_key" ON "mouvements_tresorerie"("paiementId");

-- AddForeignKey
ALTER TABLE "mouvements_tresorerie" ADD CONSTRAINT "mouvements_tresorerie_paiementId_fkey" FOREIGN KEY ("paiementId") REFERENCES "paiements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

