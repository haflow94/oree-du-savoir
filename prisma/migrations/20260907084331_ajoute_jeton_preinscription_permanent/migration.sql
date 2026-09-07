-- CreateTable
CREATE TABLE "jetons_preinscription_permanents" (
    "id" TEXT NOT NULL,
    "jeton" TEXT NOT NULL,
    "jetonHash" TEXT NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jetons_preinscription_permanents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jetons_preinscription_permanents_jetonHash_key" ON "jetons_preinscription_permanents"("jetonHash");
