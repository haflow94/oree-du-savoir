-- AlterEnum
ALTER TYPE "MoyenPaiement" ADD VALUE 'PRELEVEMENT';

-- CreateTable
CREATE TABLE "prelevements" (
    "id" TEXT NOT NULL,
    "paiementId" TEXT NOT NULL,
    "iban" TEXT,
    "bic" TEXT,
    "titulaire" TEXT,
    "referenceMandat" TEXT,

    CONSTRAINT "prelevements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prelevements_paiementId_key" ON "prelevements"("paiementId");

-- AddForeignKey
ALTER TABLE "prelevements" ADD CONSTRAINT "prelevements_paiementId_fkey" FOREIGN KEY ("paiementId") REFERENCES "paiements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
