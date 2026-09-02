-- Correctif de modélisation : Cohorte doit être Section + niveau + jour,
-- une identité autosuffisante créée en amont, indépendante de tout Cours —
-- pas un "sac de cours" dont la section se déduirait des cours attachés
-- (erreur de la migration précédente 20260901171238). Conséquence directe
-- de cette erreur, vérifiée en base : la donnée réelle importée (planning
-- Études Islamiques) contenait des blocs identiques (même section, même
-- niveau, même jour) éclatés en plusieurs Cohortes, une par cours attaché,
-- au lieu d'une seule Cohorte avec plusieurs cours affectés.
--
-- 1. Fusionne les Cohortes en doublon sur (section déduite de leurs cours,
--    niveau, jour) — vérifié avant migration : aucune Cohorte ne mélange
--    déjà plusieurs sections, aucun cours n'est partagé entre deux
--    Cohortes d'un même groupe de doublons, aucune capaciteMax ni
--    AffectationCohorte n'existe sur les Cohortes concernées. La fusion
--    est donc mécanique et sans perte : les CohorteCours et Classes des
--    Cohortes fusionnées sont réaffectés vers une Cohorte survivante
--    (la plus ancienne du groupe, par id), les autres sont supprimées.
-- 2. Ajoute Cohorte.sectionId (backfillé depuis le cours déjà attaché,
--    sûr après la fusion ci-dessus), devient l'ancrage de l'identité.
-- 3. Ajoute la contrainte d'unicité (sectionId, niveau, jour), désormais
--    sûre (plus de doublon possible après la fusion).

-- 1. Fusion des doublons
CREATE TEMP TABLE cohorte_section AS
SELECT DISTINCT ON (cc."cohorteId") cc."cohorteId", co."sectionId"
FROM "cohorte_cours" cc
JOIN "cours" co ON co.id = cc."coursId"
ORDER BY cc."cohorteId", cc."coursId";

CREATE TEMP TABLE cohorte_survivor AS
SELECT cs."cohorteId",
       FIRST_VALUE(cs."cohorteId") OVER (
         PARTITION BY cs."sectionId", c.niveau, c.jour ORDER BY cs."cohorteId"
       ) AS survivor_id
FROM cohorte_section cs
JOIN "cohortes" c ON c.id = cs."cohorteId";

UPDATE "cohorte_cours" cc
SET "cohorteId" = s.survivor_id
FROM cohorte_survivor s
WHERE cc."cohorteId" = s."cohorteId" AND s."cohorteId" <> s.survivor_id;

UPDATE "classes" cl
SET "cohorteId" = s.survivor_id
FROM cohorte_survivor s
WHERE cl."cohorteId" = s."cohorteId" AND s."cohorteId" <> s.survivor_id;

DELETE FROM "cohortes" c
USING cohorte_survivor s
WHERE c.id = s."cohorteId" AND s."cohorteId" <> s.survivor_id;

-- 2. Ajout et backfill de sectionId
ALTER TABLE "cohortes" ADD COLUMN "sectionId" TEXT;

UPDATE "cohortes" c
SET "sectionId" = (
  SELECT co."sectionId" FROM "cohorte_cours" cc JOIN "cours" co ON co.id = cc."coursId"
  WHERE cc."cohorteId" = c.id LIMIT 1
);

ALTER TABLE "cohortes" ALTER COLUMN "sectionId" SET NOT NULL;
ALTER TABLE "cohortes" ADD CONSTRAINT "cohortes_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "cohortes_sectionId_idx" ON "cohortes"("sectionId");

-- 3. Contrainte d'unicité (sectionId, niveau, jour)
CREATE UNIQUE INDEX "cohortes_sectionId_niveau_jour_key" ON "cohortes"("sectionId", "niveau", "jour");
