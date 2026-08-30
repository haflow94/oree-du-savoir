-- Renomme l'ancien concept "Cohorte" (sous-groupe d'étudiants au sein d'une
-- classe) en "GroupeEtudiants", pour libérer le nom "Cohorte" au profit du
-- nouveau catalogue amont Cours + Niveau + Jour. Renommages (pas de
-- DROP/CREATE) pour préserver les données existantes.

ALTER TABLE "cohortes" RENAME TO "groupes_etudiants";
ALTER TABLE "cohorte_etudiants" RENAME TO "groupes_etudiants_membres";
ALTER TABLE "groupes_etudiants_membres" RENAME COLUMN "cohorteId" TO "groupeEtudiantsId";

ALTER TABLE "groupes_etudiants" RENAME CONSTRAINT "cohortes_pkey" TO "groupes_etudiants_pkey";
ALTER TABLE "groupes_etudiants" RENAME CONSTRAINT "cohortes_classeId_fkey" TO "groupes_etudiants_classeId_fkey";
ALTER INDEX "cohortes_classeId_idx" RENAME TO "groupes_etudiants_classeId_idx";
ALTER INDEX "cohortes_classeId_nom_key" RENAME TO "groupes_etudiants_classeId_nom_key";

ALTER TABLE "groupes_etudiants_membres" RENAME CONSTRAINT "cohorte_etudiants_pkey" TO "groupes_etudiants_membres_pkey";
ALTER TABLE "groupes_etudiants_membres" RENAME CONSTRAINT "cohorte_etudiants_cohorteId_fkey" TO "groupes_etudiants_membres_groupeEtudiantsId_fkey";
ALTER TABLE "groupes_etudiants_membres" RENAME CONSTRAINT "cohorte_etudiants_etudiantId_fkey" TO "groupes_etudiants_membres_etudiantId_fkey";
ALTER INDEX "cohorte_etudiants_etudiantId_idx" RENAME TO "groupes_etudiants_membres_etudiantId_idx";

-- Nouveau catalogue amont "Cohorte" : Cours + Niveau + Jour.
CREATE TABLE "cohortes" (
    "id" TEXT NOT NULL,
    "coursId" TEXT NOT NULL,
    "niveau" TEXT,
    "jour" "JourSemaine" NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cohortes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cohortes_coursId_idx" ON "cohortes"("coursId");

ALTER TABLE "cohortes" ADD CONSTRAINT "cohortes_coursId_fkey" FOREIGN KEY ("coursId") REFERENCES "cours"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill : une Cohorte par combinaison distincte (coursId, niveau, jour)
-- déjà utilisée par les classes existantes.
INSERT INTO "cohortes" ("id", "coursId", "niveau", "jour")
SELECT
    'coh_' || substr(md5(random()::text || clock_timestamp()::text || "coursId" || COALESCE("niveau", '') || "jour"::text), 1, 21),
    "coursId",
    "niveau",
    "jour"
FROM (SELECT DISTINCT "coursId", "niveau", "jour" FROM "classes") AS distinctes;

-- Rattache chaque classe existante à sa Cohorte, puis bascule le schéma.
ALTER TABLE "classes" ADD COLUMN "cohorteId" TEXT;

UPDATE "classes" c
SET "cohorteId" = co."id"
FROM "cohortes" co
WHERE co."coursId" = c."coursId"
  AND co."jour" = c."jour"
  AND co."niveau" IS NOT DISTINCT FROM c."niveau";

ALTER TABLE "classes" ALTER COLUMN "cohorteId" SET NOT NULL;

ALTER TABLE "classes" DROP CONSTRAINT "classes_coursId_fkey";
DROP INDEX "classes_coursId_idx";
ALTER TABLE "classes" DROP COLUMN "coursId";
ALTER TABLE "classes" DROP COLUMN "niveau";
ALTER TABLE "classes" DROP COLUMN "jour";

ALTER TABLE "classes" ADD CONSTRAINT "classes_cohorteId_fkey" FOREIGN KEY ("cohorteId") REFERENCES "cohortes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "classes_cohorteId_idx" ON "classes"("cohorteId");
