-- ============================================================
-- SportFun — RLS-aanscherping (sluit twee resterende lekken)
-- Voer uit in Supabase SQL Editor
-- ============================================================
-- 1. activiteiten_fiches: goedgekeurde fiches waren leesbaar voor
--    ANONIEME (uitgelogde) bezoekers. De bedoeling was "ingelogde
--    gebruikers". We voegen auth.uid() IS NOT NULL toe.
-- 2. v_jaartotaal_lesgever: deze view toont financiële totalen maar
--    draaide met de rechten van de eigenaar (RLS-bypass). Met
--    security_invoker erft de view de RLS van de onderliggende
--    contracten-tabel, zodat een lesgever enkel zijn eigen totaal ziet.
-- ============================================================

-- ── 1. Fiches: enkel zichtbaar voor ingelogde gebruikers ──────
DROP POLICY IF EXISTS "Fiches: lezen" ON activiteiten_fiches;

CREATE POLICY "Fiches: lezen"
  ON activiteiten_fiches FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      status = 'goedgekeurd'
      OR aangemaakt_door = auth.uid()
      OR eigen_rol() IN ('admin','coordinator')
    )
  );

-- ── 2. Jaartotaal-view: RLS van contracten respecteren ────────
ALTER VIEW v_jaartotaal_lesgever SET (security_invoker = true);

-- ── Controle ──────────────────────────────────────────────────
-- Verwacht: 1 SELECT-policy op activiteiten_fiches met auth.uid()-check
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'activiteiten_fiches'
ORDER BY policyname;

-- Verwacht: security_invoker = true op de view
SELECT c.relname AS view_naam, c.reloptions
FROM pg_class c
WHERE c.relname = 'v_jaartotaal_lesgever';
