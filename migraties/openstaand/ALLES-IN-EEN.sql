-- ═══════════════════════════════════════════════════════════════
-- ALLE OPENSTAANDE MIGRATIES IN ÉÉN KEER
--
-- Kopieer dit volledige bestand in de Supabase SQL-editor en klik Run:
-- https://supabase.com/dashboard/project/coiocqvopxgvdezuwqou/sql/new
--
-- Veilig om meermaals uit te voeren (IF NOT EXISTS overal).
-- Onderaan staat een controlequery die toont of alles gelukt is.
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- 1. beschikbaarheid_deadline op kampen
-- ───────────────────────────────────────────────────────────────

ALTER TABLE kampen
  ADD COLUMN IF NOT EXISTS beschikbaarheid_deadline date;

COMMENT ON COLUMN kampen.beschikbaarheid_deadline IS
  'Datum waarvoor lesgevers hun beschikbaarheid moeten opgeven. Na deze datum wordt het formulier geblokkeerd.';


-- ───────────────────────────────────────────────────────────────
-- 2. contract_historiek (audit-log)
--
-- Bewust GEEN foreign key naar contracten: de historiek moet
-- bewaard blijven nadat een contract verwijderd is.
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contract_historiek (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     uuid NOT NULL,
  lesgever_id     uuid,
  kamp_id         uuid,
  actie           text NOT NULL, -- aangemaakt | gewijzigd | ondertekend | betaald | onbetaald | verwijderd | handtekening_vervallen
  details         jsonb,
  uitgevoerd_door uuid DEFAULT auth.uid(),
  uitgevoerd_op   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_historiek_contract ON contract_historiek(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_historiek_lesgever ON contract_historiek(lesgever_id);


-- ───────────────────────────────────────────────────────────────
-- 3. RLS op contract_historiek
--
-- Iedereen die is ingelogd mag loggen (ook een lesgever bij het
-- ondertekenen); enkel beheerders/coördinatoren mogen lezen.
-- Wijzigen of verwijderen kan niemand — daarvoor is bewust geen
-- policy aangemaakt, wat een audit-log hoort te zijn.
-- ───────────────────────────────────────────────────────────────

ALTER TABLE contract_historiek ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'contract_historiek'
                   AND policyname = 'Historiek: ingelogd loggen') THEN
    CREATE POLICY "Historiek: ingelogd loggen" ON contract_historiek
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'contract_historiek'
                   AND policyname = 'Historiek: beheerder lezen') THEN
    CREATE POLICY "Historiek: beheerder lezen" ON contract_historiek
      FOR SELECT USING (eigen_rol() IN ('admin', 'coordinator'));
  END IF;
END $$;


-- ───────────────────────────────────────────────────────────────
-- 4. DELETE-policy op contracten
--    (nodig om contracten te kunnen verwijderen)
-- ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'contracten'
                   AND policyname = 'Contracten: beheerder verwijderen') THEN
    CREATE POLICY "Contracten: beheerder verwijderen" ON contracten
      FOR DELETE USING (eigen_rol() IN ('admin', 'coordinator'));
  END IF;
END $$;


-- ───────────────────────────────────────────────────────────────
-- 5. CONTROLE — alle vier de regels moeten "OK" tonen
-- ───────────────────────────────────────────────────────────────

SELECT 'kolom beschikbaarheid_deadline' AS onderdeel,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'kampen'
                           AND column_name = 'beschikbaarheid_deadline')
            THEN 'OK' ELSE 'ONTBREEKT' END AS status
UNION ALL
SELECT 'tabel contract_historiek',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_name = 'contract_historiek')
            THEN 'OK' ELSE 'ONTBREEKT' END
UNION ALL
SELECT 'policies contract_historiek (2)',
       CASE WHEN (SELECT count(*) FROM pg_policies
                  WHERE tablename = 'contract_historiek') = 2
            THEN 'OK' ELSE 'ONTBREEKT' END
UNION ALL
SELECT 'delete-policy contracten',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                         WHERE tablename = 'contracten'
                           AND policyname = 'Contracten: beheerder verwijderen')
            THEN 'OK' ELSE 'ONTBREEKT' END;
