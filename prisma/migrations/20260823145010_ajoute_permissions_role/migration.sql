-- CreateEnum
CREATE TYPE "Module" AS ENUM ('ETUDIANTS', 'CLASSES', 'PRESENCES', 'ACTIVITES', 'PAIEMENTS', 'TRESORERIE', 'ADMINISTRATION', 'DOCUMENTS', 'INSCRIPTIONS', 'CALENDRIER');

-- CreateEnum
CREATE TYPE "NiveauAcces" AS ENUM ('AUCUN', 'LECTURE', 'ECRITURE');

-- CreateTable
CREATE TABLE "permissions_role" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "module" "Module" NOT NULL,
    "niveau" "NiveauAcces" NOT NULL DEFAULT 'AUCUN',

    CONSTRAINT "permissions_role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permissions_role_role_module_key" ON "permissions_role"("role", "module");
