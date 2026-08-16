-- CreateEnum
CREATE TYPE "Role" AS ENUM ('BUREAU', 'ADMINISTRATION', 'ACCUEIL', 'TRESORIER', 'ENSEIGNANT');

-- CreateTable
CREATE TABLE "utilisateurs" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dernierLogin" TIMESTAMP(3),

    CONSTRAINT "utilisateurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annees_scolaires" (
    "id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "annees_scolaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_audit" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT,
    "action" TEXT NOT NULL,
    "entite" TEXT NOT NULL,
    "entiteId" TEXT,
    "details" JSONB,
    "horodatage" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utilisateurs_email_key" ON "utilisateurs"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_utilisateurId_idx" ON "sessions"("utilisateurId");

-- CreateIndex
CREATE UNIQUE INDEX "annees_scolaires_libelle_key" ON "annees_scolaires"("libelle");

-- CreateIndex
CREATE INDEX "journal_audit_utilisateurId_idx" ON "journal_audit"("utilisateurId");

-- CreateIndex
CREATE INDEX "journal_audit_entite_entiteId_idx" ON "journal_audit"("entite", "entiteId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_audit" ADD CONSTRAINT "journal_audit_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
