-- Ajoute la date d'inscription (métier, modifiable) sans toucher à creeLe
-- (horodatage technique, jamais corrigé). Backfill des étudiants existants
-- avec leur creeLe avant de rendre la colonne obligatoire.
ALTER TABLE "etudiants" ADD COLUMN "dateInscription" TIMESTAMP(3);

UPDATE "etudiants" SET "dateInscription" = "creeLe" WHERE "dateInscription" IS NULL;

ALTER TABLE "etudiants" ALTER COLUMN "dateInscription" SET NOT NULL;
