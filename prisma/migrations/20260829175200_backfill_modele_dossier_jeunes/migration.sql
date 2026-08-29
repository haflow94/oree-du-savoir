-- Backfill : une base existante a déjà sa section "Jeunes" créée par
-- seedSections avant la migration qui a introduit la colonne
-- modeleDossier (défaut ADULTES pour toute ligne préexistante, comme les 3
-- autres sections). Une base neuve n'est pas concernée : le seed crée
-- directement "Jeunes" avec modeleDossier = JEUNES. Idempotent.
UPDATE "sections" SET "modeleDossier" = 'JEUNES' WHERE "nom" = 'Jeunes';
