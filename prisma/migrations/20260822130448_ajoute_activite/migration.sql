-- CreateTable
CREATE TABLE "activites" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "contenu" TEXT,
    "date" DATE NOT NULL,
    "lieu" TEXT,
    "creeParId" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activites_date_idx" ON "activites"("date");

-- AddForeignKey
ALTER TABLE "activites" ADD CONSTRAINT "activites_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
