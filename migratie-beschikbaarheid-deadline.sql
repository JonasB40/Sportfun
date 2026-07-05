-- Migratie: beschikbaarheid_deadline kolom op kampen
-- Uitvoeren in Supabase SQL editor

ALTER TABLE kampen
  ADD COLUMN IF NOT EXISTS beschikbaarheid_deadline date;

COMMENT ON COLUMN kampen.beschikbaarheid_deadline IS
  'Datum waarvoor lesgevers hun beschikbaarheid moeten opgeven. Na deze datum wordt het formulier geblokkeerd.';
