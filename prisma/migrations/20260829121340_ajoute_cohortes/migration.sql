-- CreateTable
CREATE TABLE "cohortes" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cohortes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cohorte_etudiants" (
    "cohorteId" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "ajouteLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cohorte_etudiants_pkey" PRIMARY KEY ("cohorteId","etudiantId")
);

-- CreateIndex
CREATE INDEX "cohortes_classeId_idx" ON "cohortes"("classeId");

-- CreateIndex
CREATE UNIQUE INDEX "cohortes_classeId_nom_key" ON "cohortes"("classeId", "nom");

-- CreateIndex
CREATE INDEX "cohorte_etudiants_etudiantId_idx" ON "cohorte_etudiants"("etudiantId");

-- AddForeignKey
ALTER TABLE "cohortes" ADD CONSTRAINT "cohortes_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cohorte_etudiants" ADD CONSTRAINT "cohorte_etudiants_cohorteId_fkey" FOREIGN KEY ("cohorteId") REFERENCES "cohortes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cohorte_etudiants" ADD CONSTRAINT "cohorte_etudiants_etudiantId_fkey" FOREIGN KEY ("etudiantId") REFERENCES "etudiants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
