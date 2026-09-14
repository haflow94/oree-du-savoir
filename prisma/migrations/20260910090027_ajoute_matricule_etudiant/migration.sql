-- Identifiant métier stable "matricule" (Etudiant.matricule) : 6 chiffres,
-- unique, attribué une seule fois et jamais réutilisé (voir commentaire sur
-- le champ dans schema.prisma). Distinct du cuid technique de la table.
--
-- Étapes, dans l'ordre, en une seule transaction (comportement par défaut
-- d'une migration Prisma sous Postgres) :
--   1. Colonne ajoutée nullable, le temps du backfill.
--   2. Séquence créée : c'est elle qui pilote À LA FOIS le backfill
--      ci-dessous ET toute génération future (voir étape 5) — pas de seuil
--      arbitraire à faire coïncider entre les deux.
--   3. Backfill déterministe des étudiants déjà présents, dans l'ordre
--      d'inscription (creeLe, puis id en cas d'égalité stricte).
--   4. La séquence est positionnée juste après le dernier matricule
--      attribué au backfill, pour que le premier nouvel étudiant créé après
--      cette migration continue la numérotation sans trou ni collision.
--   5. Colonne rendue obligatoire, avec valeur par défaut calculée par la
--      séquence (format déjà correct à l'écriture, jamais reformaté
--      ailleurs) + contrainte d'unicité.
--   6. Trigger d'immutabilité : bloque toute modification de matricule une
--      fois qu'il est non nul (donc après l'attribution initiale, qu'elle
--      vienne du backfill ci-dessus ou du DEFAULT pour un nouvel étudiant).

-- 1. Colonne nullable
ALTER TABLE "etudiants" ADD COLUMN "matricule" CHAR(6);

-- 2. Séquence
CREATE SEQUENCE "etudiant_matricule_seq";

-- 3. Backfill déterministe
WITH "ordonnes" AS (
  SELECT "id", row_number() OVER (ORDER BY "creeLe" ASC, "id" ASC) AS "rang"
  FROM "etudiants"
)
UPDATE "etudiants" AS "e"
SET "matricule" = lpad("ordonnes"."rang"::text, 6, '0')
FROM "ordonnes"
WHERE "e"."id" = "ordonnes"."id";

-- 4. Positionne la séquence après le dernier matricule attribué au backfill.
-- GREATEST(…, 1) : sur une base neuve sans aucun étudiant (count = 0),
-- setval refuse toute valeur < 1 (borne basse par défaut d'une séquence) —
-- constaté en rejouant les migrations depuis zéro sur une base vide.
SELECT setval('"etudiant_matricule_seq"', GREATEST((SELECT count(*) FROM "etudiants"), 1));

-- 5. Colonne obligatoire, défaut = valeur suivante de la séquence, unique
ALTER TABLE "etudiants"
  ALTER COLUMN "matricule" SET DEFAULT lpad(nextval('"etudiant_matricule_seq"')::text, 6, '0'),
  ALTER COLUMN "matricule" SET NOT NULL;

CREATE UNIQUE INDEX "etudiants_matricule_key" ON "etudiants"("matricule");

-- 6. Immutabilité : autorise UNIQUEMENT la transition NULL -> valeur (donc
-- l'attribution initiale, y compris celle faite par le backfill ci-dessus
-- dans CETTE même migration) ; refuse toute modification ultérieure.
CREATE OR REPLACE FUNCTION empecher_modification_matricule()
RETURNS trigger AS $$
BEGIN
  IF OLD."matricule" IS NOT NULL AND NEW."matricule" IS DISTINCT FROM OLD."matricule" THEN
    RAISE EXCEPTION 'matricule immuable : modification refusée (etudiant %)', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "etudiants_matricule_immuable"
BEFORE UPDATE ON "etudiants"
FOR EACH ROW EXECUTE FUNCTION empecher_modification_matricule();
