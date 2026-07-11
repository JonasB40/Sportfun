-- Voeg het veld hobby_sporten toe aan de profielen-tabel.
-- Voer dit uit in de Supabase SQL Editor.

ALTER TABLE profielen ADD COLUMN IF NOT EXISTS hobby_sporten text;
