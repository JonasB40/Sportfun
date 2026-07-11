-- ============================================================
-- SportFun — RLS Fix (voer uit in Supabase SQL Editor)
-- Maakt eigen_rol() aan + essentiële toegangspolicies
-- ============================================================
-- BELANGRIJK: policies werken ALLEEN als RLS ook is ingeschakeld.
-- Stap 2 hieronder zet RLS expliciet aan op elke tabel. Zonder die
-- stap staan de tabellen publiek open, ook al bestaan de policies.
-- ============================================================

-- 1. Hulpfunctie: haalt rol op zonder RLS-controle (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.eigen_rol()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT rol FROM public.profielen WHERE id = auth.uid(); $$;

-- 2. Schakel Row Level Security in op ALLE tabellen
--    (verplicht — anders worden de policies hieronder genegeerd)
ALTER TABLE profielen           ENABLE ROW LEVEL SECURITY;
ALTER TABLE kampen              ENABLE ROW LEVEL SECURITY;
ALTER TABLE kamp_lesgevers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE beschikbaarheden    ENABLE ROW LEVEL SECURITY;
ALTER TABLE activiteiten_fiches ENABLE ROW LEVEL SECURITY;
ALTER TABLE dagprogrammas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE dagprogramma_fiches ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracten          ENABLE ROW LEVEL SECURITY;
ALTER TABLE uitnodigingen       ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaties        ENABLE ROW LEVEL SECURITY;

-- ── Profielen ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Profiel: eigen lezen"         ON profielen;
DROP POLICY IF EXISTS "Profiel: beheerder alles lezen" ON profielen;
DROP POLICY IF EXISTS "Profiel: eigen bijwerken"      ON profielen;
DROP POLICY IF EXISTS "Profiel: admin alle bijwerken" ON profielen;
DROP POLICY IF EXISTS "Profiel: admin aanmaken"       ON profielen;

CREATE POLICY "Profiel: lezen"
  ON profielen FOR SELECT
  USING (id = auth.uid() OR eigen_rol() IN ('admin','coordinator'));

CREATE POLICY "Profiel: bijwerken"
  ON profielen FOR UPDATE
  USING (id = auth.uid() OR eigen_rol() IN ('admin','coordinator'));

CREATE POLICY "Profiel: aanmaken"
  ON profielen FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── Kampen ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Kampen: lesgever eigen zien"   ON kampen;
DROP POLICY IF EXISTS "Kampen: beheerder schrijven"   ON kampen;

CREATE POLICY "Kampen: ingelogd lezen"
  ON kampen FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Kampen: beheerder schrijven"
  ON kampen FOR ALL
  USING (eigen_rol() IN ('admin','coordinator'));

-- ── Kamp_lesgevers ───────────────────────────────────────────
DROP POLICY IF EXISTS "KampLesgevers: eigen zien"        ON kamp_lesgevers;
DROP POLICY IF EXISTS "KampLesgevers: beheerder schrijven" ON kamp_lesgevers;

CREATE POLICY "KampLesgevers: lezen"
  ON kamp_lesgevers FOR SELECT
  USING (lesgever_id = auth.uid() OR eigen_rol() IN ('admin','coordinator'));

CREATE POLICY "KampLesgevers: schrijven"
  ON kamp_lesgevers FOR ALL
  USING (eigen_rol() IN ('admin','coordinator'));

CREATE POLICY "KampLesgevers: eigen bijwerken"
  ON kamp_lesgevers FOR UPDATE
  USING (lesgever_id = auth.uid() OR eigen_rol() IN ('admin','coordinator'));

-- ── Beschikbaarheden ─────────────────────────────────────────
DROP POLICY IF EXISTS "Beschikbaar: eigen lezen en schrijven" ON beschikbaarheden;

CREATE POLICY "Beschikbaar: alles"
  ON beschikbaarheden FOR ALL
  USING (lesgever_id = auth.uid() OR eigen_rol() IN ('admin','coordinator'));

-- ── Activiteiten fiches ──────────────────────────────────────
DROP POLICY IF EXISTS "Fiches: goedgekeurd iedereen lezen" ON activiteiten_fiches;
DROP POLICY IF EXISTS "Fiches: iedereen aanmaken"          ON activiteiten_fiches;
DROP POLICY IF EXISTS "Fiches: eigen of beheerder bijwerken" ON activiteiten_fiches;

-- LET OP: auth.uid() IS NOT NULL is verplicht, anders zijn goedgekeurde
-- fiches leesbaar voor ANONIEME (uitgelogde) bezoekers.
CREATE POLICY "Fiches: lezen"
  ON activiteiten_fiches FOR SELECT
  USING (auth.uid() IS NOT NULL
         AND (status = 'goedgekeurd'
              OR aangemaakt_door = auth.uid()
              OR eigen_rol() IN ('admin','coordinator')));

CREATE POLICY "Fiches: aanmaken"
  ON activiteiten_fiches FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Fiches: bijwerken"
  ON activiteiten_fiches FOR UPDATE
  USING (aangemaakt_door = auth.uid() OR eigen_rol() IN ('admin','coordinator'));

-- ── Dagprogrammas ────────────────────────────────────────────
DROP POLICY IF EXISTS "Dagprog: lezen via kamp"      ON dagprogrammas;
DROP POLICY IF EXISTS "Dagprog: beheerder schrijven" ON dagprogrammas;

CREATE POLICY "Dagprog: lezen"
  ON dagprogrammas FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Dagprog: schrijven"
  ON dagprogrammas FOR ALL
  USING (eigen_rol() IN ('admin','coordinator'));

-- ── Dagprogramma fiches ──────────────────────────────────────
DROP POLICY IF EXISTS "DagprogFiches: lezen via dagprogramma" ON dagprogramma_fiches;
DROP POLICY IF EXISTS "DagprogFiches: beheerder schrijven"    ON dagprogramma_fiches;

CREATE POLICY "DagprogFiches: lezen"
  ON dagprogramma_fiches FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "DagprogFiches: schrijven"
  ON dagprogramma_fiches FOR ALL
  USING (eigen_rol() IN ('admin','coordinator'));

-- ── Contracten ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Contracten: eigen lezen"     ON contracten;
DROP POLICY IF EXISTS "Contracten: eigen ondertekenen" ON contracten;
DROP POLICY IF EXISTS "Contracten: beheerder aanmaken" ON contracten;

CREATE POLICY "Contracten: lezen"
  ON contracten FOR SELECT
  USING (lesgever_id = auth.uid() OR eigen_rol() IN ('admin','coordinator'));

CREATE POLICY "Contracten: schrijven"
  ON contracten FOR ALL
  USING (lesgever_id = auth.uid() OR eigen_rol() IN ('admin','coordinator'));

-- ── Notificaties ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Notificaties: eigen lezen en bijwerken" ON notificaties;
DROP POLICY IF EXISTS "Notificaties: systeem aanmaken"         ON notificaties;

CREATE POLICY "Notificaties: alles eigen"
  ON notificaties FOR ALL
  USING (gebruiker_id = auth.uid());

CREATE POLICY "Notificaties: aanmaken"
  ON notificaties FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── Uitnodigingen ────────────────────────────────────────────
DROP POLICY IF EXISTS "Uitnodigingen: beheerder alles" ON uitnodigingen;
DROP POLICY IF EXISTS "Uitnodigingen: token validatie" ON uitnodigingen;

CREATE POLICY "Uitnodigingen: beheerder"
  ON uitnodigingen FOR ALL
  USING (eigen_rol() IN ('admin','coordinator'));

-- BEWUST GEEN publieke "token lezen USING (true)" policy meer:
-- die maakte ALLE uitnodigingen (incl. e-mailadressen + tokens)
-- publiek leesbaar. Anonieme tokenvalidatie bij registratie verloopt
-- via de SECURITY DEFINER functie publiek_valideer_uitnodiging(),
-- aangemaakt in migratie-veiligheid.sql.

-- ── Controleer ───────────────────────────────────────────────
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
