-- ═══════════════════════════════════════════════════════════════
-- Migratie: contract_historiek (audit-log) + DELETE-policy contracten
-- Voer dit uit in de Supabase SQL-editor.
-- ═══════════════════════════════════════════════════════════════

-- 1. Audit-log tabel. Bewust GEEN foreign key naar contracten:
--    de historiek moet bewaard blijven nadat een contract verwijderd is.
CREATE TABLE IF NOT EXISTS contract_historiek (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id    uuid NOT NULL,
  lesgever_id    uuid,
  kamp_id        uuid,
  actie          text NOT NULL, -- aangemaakt | gewijzigd | ondertekend | betaald | onbetaald | verwijderd | handtekening_vervallen
  details        jsonb,
  uitgevoerd_door uuid DEFAULT auth.uid(),
  uitgevoerd_op  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_historiek_contract ON contract_historiek(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_historiek_lesgever ON contract_historiek(lesgever_id);

-- 2. RLS: iedereen die is ingelogd mag loggen (ook lesgever bij ondertekenen);
--    enkel beheerders/coördinatoren mogen de historiek lezen.
--    Wijzigen of verwijderen van logregels kan niemand (geen policies).
ALTER TABLE contract_historiek ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contract_historiek' AND policyname = 'Historiek: ingelogd loggen') THEN
    CREATE POLICY "Historiek: ingelogd loggen" ON contract_historiek
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contract_historiek' AND policyname = 'Historiek: beheerder lezen') THEN
    CREATE POLICY "Historiek: beheerder lezen" ON contract_historiek
      FOR SELECT USING (eigen_rol() IN ('admin', 'coordinator'));
  END IF;
END $$;

-- 3. DELETE-policy op contracten (nodig om contracten te kunnen verwijderen)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contracten' AND policyname = 'Contracten: beheerder verwijderen') THEN
    CREATE POLICY "Contracten: beheerder verwijderen" ON contracten
      FOR DELETE USING (eigen_rol() IN ('admin', 'coordinator'));
  END IF;
END $$;
