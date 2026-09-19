-- Fusionne le rôle Trésorier dans Bureau (décision associative : le
-- Trésorier a déjà exactement les mêmes droits que le Bureau depuis le seed
-- initial, voir prisma/seed.ts) et introduit une table de libellés de rôle
-- éditables depuis Administration → Rôles.
--
-- Écrit à la main plutôt que généré par `prisma migrate dev` : la
-- suppression d'une valeur d'enum Postgres nécessite de reconstruire le
-- type, et il faut d'abord migrer les données existantes qui utilisent
-- encore 'TRESORIER' avant de pouvoir la retirer.

BEGIN;

-- 1. Tout compte encore en Trésorier bascule vers Bureau (droits identiques).
UPDATE "utilisateurs" SET "role" = 'BUREAU' WHERE "role" = 'TRESORIER';

-- 2. Les lignes de la grille de permissions pour Trésorier n'ont plus de
--    sens (Bureau n'est de toute façon jamais lu depuis cette table — voir
--    lib/permissions.ts) : on les retire plutôt que de les réassigner, ce
--    qui entrerait en conflit avec les lignes Bureau déjà présentes
--    (contrainte unique role+module).
DELETE FROM "permissions_role" WHERE "role" = 'TRESORIER';

-- 3. Reconstruit le type enum Role sans TRESORIER.
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('BUREAU', 'ADMINISTRATION', 'ACCUEIL', 'ENSEIGNANT', 'ACTIVITE');
ALTER TABLE "utilisateurs" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "permissions_role" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
DROP TYPE "Role_old";

-- 4. Libellés de rôle éditables (Administration → Rôles).
CREATE TABLE "libelles_role" (
    "role" "Role" NOT NULL,
    "libelle" TEXT NOT NULL,

    CONSTRAINT "libelles_role_pkey" PRIMARY KEY ("role")
);

COMMIT;
