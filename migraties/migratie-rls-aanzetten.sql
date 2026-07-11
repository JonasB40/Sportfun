-- ============================================================
-- SportFun — KRITIEKE FIX: RLS aanzetten op kerntabellen
-- Voer uit in Supabase SQL Editor
-- ============================================================
-- Probleem: 10 tabellen hadden policies, maar RLS stond UIT.
-- Policies zonder ingeschakelde RLS worden door Postgres genegeerd
-- → de tabellen waren volledig publiek leesbaar/schrijfbaar.
--
-- Oorzaak: fix-rls.sql herstelde de policies maar bevatte geen
-- ENABLE ROW LEVEL SECURITY (terwijl RLS eerder was uitgezet).
--
-- Deze migratie zet RLS aan op alle betrokken tabellen. De policies
-- bestaan al en zijn correct, dus het gedrag wordt meteen juist
-- afgedwongen zonder dat de app breekt.
-- ============================================================

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

-- ── Controle: alles moet nu rls_aan = true zijn met >= 1 policy ──
SELECT
  c.relname AS tabel,
  c.relrowsecurity AS rls_aan,
  COUNT(p.policyname) AS aantal_policies
FROM pg_class c
LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
WHERE c.relkind = 'r'
  AND c.relnamespace = 'public'::regnamespace
GROUP BY c.relname, c.relrowsecurity
ORDER BY rls_aan, c.relname;
