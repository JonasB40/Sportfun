-- ============================================================
-- SportFun — RLS-fix voor financiële tabellen
-- Voer uit in Supabase SQL Editor
-- ============================================================
-- Achtergrond: migratie-financieel.sql schakelde RLS expliciet
-- UIT op financiele_limieten en standaard_vergoeding.
-- Supabase geeft hiervoor de waarschuwingen:
--   rls_disabled_in_public
--   sensitive_columns_exposed
-- ============================================================

-- ── 1. financiele_limieten ───────────────────────────────────
-- Bevat wettelijke limieten (max_per_dag, max_per_jaar, km_tarief).
-- Ingelogde gebruikers mogen lezen; admins/coördinatoren mogen schrijven.

ALTER TABLE financiele_limieten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "FinLimieten: ingelogd lezen"    ON financiele_limieten;
DROP POLICY IF EXISTS "FinLimieten: beheerder schrijven" ON financiele_limieten;

CREATE POLICY "FinLimieten: ingelogd lezen"
  ON financiele_limieten FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "FinLimieten: beheerder schrijven"
  ON financiele_limieten FOR ALL
  USING (eigen_rol() IN ('admin', 'coordinator'));


-- ── 2. standaard_vergoeding ──────────────────────────────────
-- Bevat standaarddagvergoeding per rol.
-- Zelfde logica: ingelogd lezen, beheerder schrijven.

ALTER TABLE standaard_vergoeding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "StdVergoeding: ingelogd lezen"    ON standaard_vergoeding;
DROP POLICY IF EXISTS "StdVergoeding: beheerder schrijven" ON standaard_vergoeding;

CREATE POLICY "StdVergoeding: ingelogd lezen"
  ON standaard_vergoeding FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "StdVergoeding: beheerder schrijven"
  ON standaard_vergoeding FOR ALL
  USING (eigen_rol() IN ('admin', 'coordinator'));


-- ── 3. Controleer resultaat ──────────────────────────────────
SELECT
  c.relname                                          AS tabel,
  c.relrowsecurity                                   AS rls_aan,
  COUNT(p.policyname)                                AS policies
FROM pg_class c
LEFT JOIN pg_policies p
  ON p.tablename = c.relname AND p.schemaname = 'public'
WHERE c.relname IN ('financiele_limieten','standaard_vergoeding')
  AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity;
