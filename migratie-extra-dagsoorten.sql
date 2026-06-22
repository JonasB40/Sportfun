-- ============================================================
-- SportFun — Migratie: extra dagsoorten op contracten
-- Voer uit in Supabase SQL Editor
-- LET OP: éénmalige migratie — niet twee keer uitvoeren.
--         Stap 3 zal falen als totaal_bedrag al bestaat.
-- ============================================================

-- Stap 1: verwijder de view die afhangt van totaal_bedrag, dan de kolom zelf
DROP VIEW IF EXISTS v_jaartotaal_lesgever;
ALTER TABLE contracten DROP COLUMN IF EXISTS totaal_bedrag;

-- Stap 2: voeg de vier nieuwe dagtype-kolommen toe (met CHECK 0..1)
ALTER TABLE contracten
  ADD COLUMN IF NOT EXISTS voorbereidingsdag_dagen  numeric(3,2) DEFAULT 0
    CHECK (voorbereidingsdag_dagen >= 0 AND voorbereidingsdag_dagen <= 1),
  ADD COLUMN IF NOT EXISTS opruimdag_dagen          numeric(3,2) DEFAULT 0
    CHECK (opruimdag_dagen >= 0 AND opruimdag_dagen <= 1),
  ADD COLUMN IF NOT EXISTS opleidingsdag_dagen      numeric(3,2) DEFAULT 0
    CHECK (opleidingsdag_dagen >= 0 AND opleidingsdag_dagen <= 1),
  ADD COLUMN IF NOT EXISTS evaluatiemoment_dagen    numeric(3,2) DEFAULT 0
    CHECK (evaluatiemoment_dagen >= 0 AND evaluatiemoment_dagen <= 1);

-- Stap 3: maak de gegenereerde kolom opnieuw aan (nu inclusief extra dagsoorten)
-- (geen IF NOT EXISTS mogelijk op generated columns — stap 1 zorgt ervoor dat dit veilig is)
ALTER TABLE contracten
  ADD COLUMN totaal_bedrag numeric(8,2)
  GENERATED ALWAYS AS (
    COALESCE(vergoeding_per_dag * aantal_dagen, 0)
    + COALESCE(kilometers * km_tarief, 0)
    + COALESCE(vergoeding_per_dag * voorbereidingsdag_dagen, 0)
    + COALESCE(vergoeding_per_dag * opruimdag_dagen, 0)
    + COALESCE(vergoeding_per_dag * opleidingsdag_dagen, 0)
    + COALESCE(vergoeding_per_dag * evaluatiemoment_dagen, 0)
  ) STORED;

-- Stap 4: herstel de view (nu inclusief extra dagsoorten in totaal_bedrag)
CREATE OR REPLACE VIEW v_jaartotaal_lesgever AS
SELECT
  c.lesgever_id,
  EXTRACT(YEAR FROM COALESCE(k.startdatum, c.gegenereerd_op::date)) AS jaar,
  SUM(c.totaal_bedrag) AS totaal_bedrag,
  SUM(CASE WHEN c.betaald THEN c.totaal_bedrag ELSE 0 END) AS uitbetaald,
  COUNT(*) AS aantal_contracten
FROM contracten c
LEFT JOIN kampen k ON k.id = c.kamp_id
GROUP BY c.lesgever_id,
         EXTRACT(YEAR FROM COALESCE(k.startdatum, c.gegenereerd_op::date));

-- Controle: check of alle kolommen aanwezig zijn
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'contracten'
  AND column_name IN (
    'totaal_bedrag',
    'voorbereidingsdag_dagen',
    'opruimdag_dagen',
    'opleidingsdag_dagen',
    'evaluatiemoment_dagen'
  )
ORDER BY column_name;
