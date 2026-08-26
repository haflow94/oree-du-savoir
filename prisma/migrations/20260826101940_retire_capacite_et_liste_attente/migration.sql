-- Retire la notion de capacité des classes (décision association) : plus de
-- limite de places, donc plus de liste d'attente possible. Aucune inscription
-- n'était en liste d'attente au moment de cette migration (vérifié) : la
-- colonne "statut" ne contenait que la valeur CONFIRMEE.

-- AlterTable
ALTER TABLE "classes" DROP COLUMN "capacite";

-- AlterTable
ALTER TABLE "inscriptions_classe" DROP COLUMN "statut";

-- DropEnum
DROP TYPE "StatutPlaceClasse";
