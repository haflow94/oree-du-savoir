-- Remplace le champ libre "contactUrgence" par 3 champs structurés
-- (nom / prénom / téléphone), obligatoires désormais au niveau formulaire.
-- Les valeurs existantes en texte libre sont reprises telles quelles dans
-- "contactUrgenceNom" (rien n'est perdu ; à reformater manuellement à la
-- prochaine modification de chaque fiche).
ALTER TABLE "etudiants" ADD COLUMN "contactUrgenceNom" TEXT;
ALTER TABLE "etudiants" ADD COLUMN "contactUrgencePrenom" TEXT;
ALTER TABLE "etudiants" ADD COLUMN "contactUrgenceTelephone" TEXT;

UPDATE "etudiants" SET "contactUrgenceNom" = "contactUrgence" WHERE "contactUrgence" IS NOT NULL;

ALTER TABLE "etudiants" DROP COLUMN "contactUrgence";
