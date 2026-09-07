-- CreateTable
CREATE TABLE "codes_preinscription" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "campagneLabel" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "utiliseLe" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creeParId" TEXT,

    CONSTRAINT "codes_preinscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "codes_preinscription_codeHash_key" ON "codes_preinscription"("codeHash");

-- CreateIndex
CREATE INDEX "codes_preinscription_expireLe_idx" ON "codes_preinscription"("expireLe");

-- AddForeignKey
ALTER TABLE "codes_preinscription" ADD CONSTRAINT "codes_preinscription_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
