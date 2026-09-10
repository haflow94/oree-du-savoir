-- Consentement photo/vidéo (voir Etudiant.autorisationPhotoVideo,
-- prisma/schema.prisma) : colonne nullable, jamais de valeur implicite. NULL
-- = non renseigné (fiches existantes, créées avant cette question ou
-- manuellement par le staff), distinct de false (refus explicite).
ALTER TABLE "etudiants" ADD COLUMN "autorisationPhotoVideo" BOOLEAN;
