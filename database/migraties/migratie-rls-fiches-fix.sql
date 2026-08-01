-- ============================================================
-- SportFun — Correctie: dubbele leespolicy op activiteiten_fiches
-- Voer uit in Supabase SQL Editor
-- ============================================================
-- Probleem: er bestonden MEERDERE SELECT-policies op
-- activiteiten_fiches (een oude permissieve onder een andere naam,
-- plus de nieuwe). Postgres combineert policies met OR, dus de oude
-- regel (status='goedgekeurd' zonder auth-check) bleef anonieme
-- toegang geven tot goedgekeurde fiches.
--
-- Oplossing: verwijder ALLE bestaande SELECT-policies op de tabel
-- (ongeacht hun naam) en maak er precies één correcte aan die
-- login vereist.
-- ============================================================

-- ── 1. Verwijder elke bestaande SELECT-policy op de tabel ─────
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activiteiten_fiches'
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.activiteiten_fiches', pol.policyname);
  END LOOP;
END $$;

-- ── 2. Eén correcte leespolicy: enkel voor ingelogde gebruikers ──
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

-- ── 3. Controle: moet exact 1 SELECT-policy tonen, met auth-check ──
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'activiteiten_fiches'
ORDER BY cmd, policyname;
