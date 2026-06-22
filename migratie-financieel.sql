-- ============================================================
-- SportFun — Migratie: financieel systeem (vrijwilligersvergoeding)
-- Voer uit in Supabase SQL Editor
-- ============================================================

-- ── Profielen: woonplaats voor km-berekening (al beschikbaar via 'adres') ──
-- (geen nieuwe kolom nodig)

-- ── Contracten: financiële velden ──
ALTER TABLE contracten
  ADD COLUMN IF NOT EXISTS vergoeding_per_dag numeric(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aantal_dagen        int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kilometers          numeric(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS km_tarief           numeric(6,4) DEFAULT 0.4361,
  ADD COLUMN IF NOT EXISTS gewerkte_dagen      date[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS betaald             boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS betaald_op          timestamptz,
  ADD COLUMN IF NOT EXISTS opmerking           text;

-- Berekend totaal (auto)
ALTER TABLE contracten
  ADD COLUMN IF NOT EXISTS totaal_bedrag       numeric(8,2)
  GENERATED ALWAYS AS (
    COALESCE(vergoeding_per_dag * aantal_dagen, 0)
    + COALESCE(kilometers * km_tarief, 0)
  ) STORED;

-- ── Profiel: kilometers van thuis tot vaste locaties (optioneel) ──
ALTER TABLE profielen
  ADD COLUMN IF NOT EXISTS kilometers_per_locatie jsonb DEFAULT '{}';
-- Bv: { "Sint-Niklaas": 8.5, "Hamme": 12, "Sombeke": 15 }

-- ── Wettelijke limieten (2026) ──
CREATE TABLE IF NOT EXISTS financiele_limieten (
  jaar              int PRIMARY KEY,
  max_per_dag       numeric(6,2) NOT NULL,
  max_per_jaar      numeric(8,2) NOT NULL,
  km_tarief         numeric(6,4) NOT NULL
);

INSERT INTO financiele_limieten (jaar, max_per_dag, max_per_jaar, km_tarief)
VALUES (2026, 44.02, 1761.00, 0.4361)
ON CONFLICT (jaar) DO UPDATE
  SET max_per_dag = EXCLUDED.max_per_dag,
      max_per_jaar = EXCLUDED.max_per_jaar,
      km_tarief = EXCLUDED.km_tarief;

-- ── Standaard dagvergoeding per rol ──
CREATE TABLE IF NOT EXISTS standaard_vergoeding (
  rol               text PRIMARY KEY,
  dagvergoeding     numeric(6,2) NOT NULL
);

INSERT INTO standaard_vergoeding (rol, dagvergoeding) VALUES
  ('lesgever',     44.02),
  ('extra_hulp',   35.00),
  ('coordinator',  44.02),
  ('admin',        44.02)
ON CONFLICT (rol) DO UPDATE SET dagvergoeding = EXCLUDED.dagvergoeding;

-- ── RLS uitschakelen op nieuwe tabellen (tot eindgebruik) ──
ALTER TABLE financiele_limieten   DISABLE ROW LEVEL SECURITY;
ALTER TABLE standaard_vergoeding   DISABLE ROW LEVEL SECURITY;

-- ── Helper view: jaartotaal per lesgever ──
CREATE OR REPLACE VIEW v_jaartotaal_lesgever AS
SELECT
  c.lesgever_id,
  EXTRACT(YEAR FROM COALESCE(k.startdatum, c.gegenereerd_op::date)) AS jaar,
  SUM(c.totaal_bedrag) AS totaal_bedrag,
  SUM(CASE WHEN c.betaald THEN c.totaal_bedrag ELSE 0 END) AS uitbetaald,
  COUNT(*) AS aantal_contracten
FROM contracten c
LEFT JOIN kampen k ON k.id = c.kamp_id
GROUP BY c.lesgever_id, EXTRACT(YEAR FROM COALESCE(k.startdatum, c.gegenereerd_op::date));

-- ── Controle ──
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name='contracten' AND column_name='vergoeding_per_dag') AS contract_kolom_ok,
  (SELECT COUNT(*) FROM financiele_limieten WHERE jaar=2026) AS limiet_2026_ok,
  (SELECT COUNT(*) FROM standaard_vergoeding) AS standaard_rollen_aantal;
