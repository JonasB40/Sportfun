-- ============================================================
-- Migratie: kampen automatisch archiveren na afloop
-- ============================================================
--
-- Het portaal zet gepasseerde kampen al in het archief zodra een
-- beheerder een pagina opent. Deze migratie doet hetzelfde
-- server-side, elke nacht, zodat het ook klopt als er dagenlang
-- niemand inlogt.
--
-- Uitvoeren in de Supabase SQL-editor. pg_cron is beschikbaar op
-- alle Supabase-projecten; de CREATE EXTENSION hieronder zet hem aan.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;

-- ── Functie: verlopen kampen archiveren ─────────────────────────
--
-- Zowel 'actief' als 'concept' wordt meegenomen: ook een kamp dat
-- nooit op actief is gezet hoort na afloop in het archief.
-- SECURITY DEFINER omdat de cron-job buiten elke gebruikerssessie
-- draait en dus geen rol heeft die RLS toelaat.

CREATE OR REPLACE FUNCTION archiveer_verlopen_kampen()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  aantal integer;
BEGIN
  UPDATE kampen
     SET status = 'afgelopen'
   WHERE status IN ('actief', 'concept')
     AND einddatum < (now() AT TIME ZONE 'Europe/Brussels')::date;

  GET DIAGNOSTICS aantal = ROW_COUNT;
  RETURN aantal;
END;
$$;

COMMENT ON FUNCTION archiveer_verlopen_kampen() IS
  'Zet kampen met een verstreken einddatum op status ''afgelopen''. Draait nachtelijk via pg_cron.';

-- Niet aanroepbaar vanaf de client: enkel de cron-job gebruikt dit.
REVOKE EXECUTE ON FUNCTION archiveer_verlopen_kampen() FROM anon, authenticated;

-- ── Nachtelijke job om 03:15 Brussel (= 02:15 UTC in de zomer) ───
-- Het exacte uur maakt niet uit; het moet enkel ná middernacht zijn.

SELECT cron.unschedule('archiveer-verlopen-kampen')
 WHERE EXISTS (
   SELECT 1 FROM cron.job WHERE jobname = 'archiveer-verlopen-kampen'
 );

SELECT cron.schedule(
  'archiveer-verlopen-kampen',
  '15 2 * * *',
  $$SELECT archiveer_verlopen_kampen()$$
);

-- ── Controle ────────────────────────────────────────────────────
-- Geplande job bekijken:
--   SELECT jobname, schedule, active FROM cron.job;
-- Laatste uitvoeringen bekijken:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- Nu meteen laten lopen (geeft het aantal gearchiveerde kampen terug):
--   SELECT archiveer_verlopen_kampen();
