-- ============================================================
-- SportFun — Migratie: beschikbaarheidsflow + koppelingsstatus
-- Voer uit in Supabase SQL Editor
-- ============================================================

-- 1. Kampen: vlag om beschikbaarheid open te zetten
ALTER TABLE kampen
  ADD COLUMN IF NOT EXISTS beschikbaarheid_open boolean DEFAULT false;

-- 2. Kamp_lesgevers: status + redenen + tijdstempels
ALTER TABLE kamp_lesgevers
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'gevraagd'
    CHECK (status IN ('gevraagd','bevestigd','geweigerd','geannuleerd')),
  ADD COLUMN IF NOT EXISTS weigeringsreden   text,
  ADD COLUMN IF NOT EXISTS annuleringsreden  text,
  ADD COLUMN IF NOT EXISTS gevraagd_op       timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS beantwoord_op     timestamptz;

-- 3. Bestaande rijen krijgen standaard status 'bevestigd'
--    (ze werden al handmatig gekoppeld zonder bevestigingsflow)
UPDATE kamp_lesgevers SET status = 'bevestigd' WHERE status = 'gevraagd';

-- 4. Index op status voor snelle filtering
CREATE INDEX IF NOT EXISTS idx_kamp_lesgevers_status ON kamp_lesgevers(status);

-- 5. Controleer
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'kamp_lesgevers'
ORDER BY ordinal_position;
