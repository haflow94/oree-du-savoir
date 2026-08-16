-- CreateEnum
CREATE TYPE "MoyenPaiement" AS ENUM ('ESPECES', 'CHEQUE', 'VIREMENT', 'CB');

-- CreateEnum
CREATE TYPE "StatutCheque" AS ENUM ('RECU', 'DEPOSE', 'ENCAISSE', 'REJETE');

-- CreateEnum
CREATE TYPE "TypeMouvement" AS ENUM ('RECETTE', 'DEPENSE');

-- CreateTable
CREATE TABLE "dossiers_annuels" (
    "id" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "montantDu" DECIMAL(10,2) NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dossiers_annuels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "echeances" (
    "id" TEXT NOT NULL,
    "dossierAnnuelId" TEXT NOT NULL,
    "libelle" TEXT,
    "montant" DECIMAL(10,2) NOT NULL,
    "dateEcheance" TIMESTAMP(3) NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "echeances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiements" (
    "id" TEXT NOT NULL,
    "echeanceId" TEXT NOT NULL,
    "moyen" "MoyenPaiement" NOT NULL,
    "montant" DECIMAL(10,2) NOT NULL,
    "datePaiement" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paiements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cheques" (
    "id" TEXT NOT NULL,
    "paiementId" TEXT NOT NULL,
    "banque" TEXT,
    "numero" TEXT,
    "titulaire" TEXT,
    "statut" "StatutCheque" NOT NULL DEFAULT 'RECU',
    "dateDepot" TIMESTAMP(3),
    "dateEncaissement" TIMESTAMP(3),
    "motifRejet" TEXT,

    CONSTRAINT "cheques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories_mouvement" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_mouvement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mouvements_tresorerie" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "libelle" TEXT NOT NULL,
    "type" "TypeMouvement" NOT NULL,
    "moyen" "MoyenPaiement" NOT NULL,
    "montant" DECIMAL(10,2) NOT NULL,
    "categorieId" TEXT,
    "justificatif" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mouvements_tresorerie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dossiers_annuels_etudiantId_anneeScolaireId_key" ON "dossiers_annuels"("etudiantId", "anneeScolaireId");

-- CreateIndex
CREATE INDEX "echeances_dossierAnnuelId_idx" ON "echeances"("dossierAnnuelId");

-- CreateIndex
CREATE INDEX "paiements_echeanceId_idx" ON "paiements"("echeanceId");

-- CreateIndex
CREATE UNIQUE INDEX "cheques_paiementId_key" ON "cheques"("paiementId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_mouvement_nom_key" ON "categories_mouvement"("nom");

-- CreateIndex
CREATE INDEX "mouvements_tresorerie_date_idx" ON "mouvements_tresorerie"("date");

-- AddForeignKey
ALTER TABLE "dossiers_annuels" ADD CONSTRAINT "dossiers_annuels_etudiantId_fkey" FOREIGN KEY ("etudiantId") REFERENCES "etudiants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossiers_annuels" ADD CONSTRAINT "dossiers_annuels_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annees_scolaires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echeances" ADD CONSTRAINT "echeances_dossierAnnuelId_fkey" FOREIGN KEY ("dossierAnnuelId") REFERENCES "dossiers_annuels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_echeanceId_fkey" FOREIGN KEY ("echeanceId") REFERENCES "echeances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_paiementId_fkey" FOREIGN KEY ("paiementId") REFERENCES "paiements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_tresorerie" ADD CONSTRAINT "mouvements_tresorerie_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "categories_mouvement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
