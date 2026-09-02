-- Cohorte peut désormais porter plusieurs Cours (bloc "Études Islamiques
-- Niveau 1 Samedi" = plusieurs matières/profs sur le même créneau, même
-- salle, même groupe d'enfants). Chaque Classe garde son propre Cours
-- (coursId direct, déduit ici de l'ancien Cohorte.coursId puisqu'il n'y a
-- encore qu'un seul Cours par Cohorte à ce stade de la migration).
--
-- Réintroduit une capacité + liste d'attente, cette fois au niveau Cohorte
-- (pas Classe/InscriptionClasse, décision association déjà actée pour ce
-- niveau-là en 20260826101940_retire_capacite_et_liste_attente) : voir
-- Cohorte.capaciteMax et la nouvelle table affectations_cohorte.
--
-- Supprime GroupeEtudiants/GroupeEtudiantsMembre, devenus redondants avec
-- l'affectation automatique multi-Classes au niveau Cohorte.

-- 1. Table de liaison Cohorte x Cours (many-to-many explicite, avec ordre
--    d'affichage) + backfill depuis l'actuel Cohorte.coursId (encore 1
--    Cours par Cohorte à ce stade).
CREATE TABLE "cohorte_cours" (
    "cohorteId" TEXT NOT NULL,
    "coursId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "cohorte_cours_pkey" PRIMARY KEY ("cohorteId","coursId")
);

CREATE INDEX "cohorte_cours_coursId_idx" ON "cohorte_cours"("coursId");

ALTER TABLE "cohorte_cours" ADD CONSTRAINT "cohorte_cours_cohorteId_fkey" FOREIGN KEY ("cohorteId") REFERENCES "cohortes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cohorte_cours" ADD CONSTRAINT "cohorte_cours_coursId_fkey" FOREIGN KEY ("coursId") REFERENCES "cours"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "cohorte_cours" ("cohorteId", "coursId", "ordre")
SELECT "id", "coursId", 0 FROM "cohortes";

-- 2. Capacité max de la Cohorte (null = illimité, jamais de valeur en dur).
ALTER TABLE "cohortes" ADD COLUMN "capaciteMax" INTEGER;

-- 3. Classe.coursId propre, backfillé depuis la Cohorte de chaque Classe
--    (déduction sûre : encore 1 Cours par Cohorte à ce stade).
ALTER TABLE "classes" ADD COLUMN "coursId" TEXT;

UPDATE "classes" c
SET "coursId" = co."coursId"
FROM "cohortes" co
WHERE co."id" = c."cohorteId";

ALTER TABLE "classes" ALTER COLUMN "coursId" SET NOT NULL;
ALTER TABLE "classes" ADD CONSTRAINT "classes_coursId_fkey" FOREIGN KEY ("coursId") REFERENCES "cours"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "classes_coursId_idx" ON "classes"("coursId");

-- 4. Retrait de l'ancien Cohorte.coursId (remplacé par cohorte_cours).
ALTER TABLE "cohortes" DROP CONSTRAINT "cohortes_coursId_fkey";
DROP INDEX "cohortes_coursId_idx";
ALTER TABLE "cohortes" DROP COLUMN "coursId";

-- 5. Affectation d'un étudiant à une Cohorte pour une année scolaire donnée
--    (capacité/liste d'attente) : voir prisma/schema.prisma#AffectationCohorte.
CREATE TYPE "StatutAffectationCohorte" AS ENUM ('AFFECTE', 'EN_ATTENTE');

CREATE TABLE "affectations_cohorte" (
    "id" TEXT NOT NULL,
    "cohorteId" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "statut" "StatutAffectationCohorte" NOT NULL DEFAULT 'AFFECTE',
    "rangListeAttente" INTEGER,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affectations_cohorte_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "affectations_cohorte_etudiantId_cohorteId_anneeScolaireId_key" ON "affectations_cohorte"("etudiantId", "cohorteId", "anneeScolaireId");
CREATE INDEX "affectations_cohorte_cohorteId_anneeScolaireId_statut_idx" ON "affectations_cohorte"("cohorteId", "anneeScolaireId", "statut");

ALTER TABLE "affectations_cohorte" ADD CONSTRAINT "affectations_cohorte_cohorteId_fkey" FOREIGN KEY ("cohorteId") REFERENCES "cohortes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "affectations_cohorte" ADD CONSTRAINT "affectations_cohorte_etudiantId_fkey" FOREIGN KEY ("etudiantId") REFERENCES "etudiants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "affectations_cohorte" ADD CONSTRAINT "affectations_cohorte_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annees_scolaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Suppression définitive de GroupeEtudiants/GroupeEtudiantsMembre
--    (redondant avec l'affectation automatique multi-Classes au niveau
--    Cohorte) — pas de rename cette fois, contrairement au rename
--    Cohorte -> GroupeEtudiants de 20260830020000_extraire_cohorte.
DROP TABLE "groupes_etudiants_membres";
DROP TABLE "groupes_etudiants";
