-- ============================================================
-- SportFun — Extra dagsoorten: max van 1 naar 10 verruimen
-- Voer uit in Supabase SQL Editor
-- ============================================================

-- 1. Drop view die afhangt van totaal_bedrag
DROP VIEW IF EXISTS v_jaartotaal_lesgever;

-- 2. Drop generated column
ALTER TABLE contracten DROP COLUMN IF EXISTS totaal_bedrag;

-- 3. Verwijder bestaande CHECK constraints
ALTER TABLE contracten
  DROP CONSTRAINT IF EXISTS contracten_voorbereidingsdag_dagen_check,
  DROP CONSTRAINT IF EXISTS contracten_opruimdag_dagen_check,
  DROP CONSTRAINT IF EXISTS contracten_opleidingsdag_dagen_check,
  DROP CONSTRAINT IF EXISTS contracten_evaluatiemoment_dagen_check;

-- 4. Vergroot kolomtype en voeg nieuwe CHECK toe (0–10)
ALTER TABLE contracten
  ALTER COLUMN voorbereidingsdag_dagen TYPE numeric(4,2),
  ALTER COLUMN opruimdag_dagen         TYPE numeric(4,2),
  ALTER COLUMN opleidingsdag_dagen     TYPE numeric(4,2),
  ALTER COLUMN evaluatiemoment_dagen   TYPE numeric(4,2),
  ADD CONSTRAINT contracten_voorbereidingsdag_dagen_check
    CHECK (voorbereidingsdag_dagen >= 0 AND voorbereidingsdag_dagen <= 10),
  ADD CONSTRAINT contracten_opruimdag_dagen_check
    CHECK (opruimdag_dagen >= 0 AND opruimdag_dagen <= 10),
  ADD CONSTRAINT contracten_opleidingsdag_dagen_check
    CHECK (opleidingsdag_dagen >= 0 AND opleidingsdag_dagen <= 10),
  ADD CONSTRAINT contracten_evaluatiemoment_dagen_check
    CHECK (evaluatiemoment_dagen >= 0 AND evaluatiemoment_dagen <= 10);

-- 5. Maak generated column opnieuw aan
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

-- 6. Herstel de view
CREATE OR REPLACE VIEW v_jaartotaal_lesgever WITH (security_invoker = true) AS
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

-- 7. Datumvelden bij extra prestaties
ALTER TABLE contracten
  ADD COLUMN IF NOT EXISTS voorbereidingsdag_datum date,
  ADD COLUMN IF NOT EXISTS opruimdag_datum         date,
  ADD COLUMN IF NOT EXISTS opleidingsdag_datum     date,
  ADD COLUMN IF NOT EXISTS evaluatiemoment_datum   date;

-- 8. Controle
SELECT column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_name = 'contracten'
  AND column_name IN ('voorbereidingsdag_dagen','opruimdag_dagen','opleidingsdag_dagen','evaluatiemoment_dagen','totaal_bedrag');
