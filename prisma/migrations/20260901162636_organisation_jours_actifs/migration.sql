-- Jours où l'association tient effectivement cours (voir Organisation.joursActifs) :
-- limite les sélecteurs de jour à la création/modification d'une Cohorte, éditable
-- depuis Administration → Organisation sans nouvelle migration.
ALTER TABLE "organisation" ADD COLUMN "joursActifs" "JourSemaine"[] NOT NULL DEFAULT ARRAY['MARDI', 'JEUDI', 'SAMEDI', 'DIMANCHE']::"JourSemaine"[];
