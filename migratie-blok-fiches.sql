-- ============================================================
-- SportFun — Meerdere fiches per dagblok
-- Voer uit in Supabase SQL Editor
-- ============================================================

-- 1. Tussentabel: meerdere fiches per blok
CREATE TABLE IF NOT EXISTS blok_fiches (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  blok_id    uuid NOT NULL REFERENCES dag_blokken(id) ON DELETE CASCADE,
  fiche_id   uuid NOT NULL REFERENCES activiteiten_fiches(id) ON DELETE CASCADE,
  volgorde   smallint NOT NULL DEFAULT 0,
  UNIQUE(blok_id, fiche_id)
);

-- 2. RLS inschakelen
ALTER TABLE blok_fiches ENABLE ROW LEVEL SECURITY;

-- 3. Leesbeleid: ingelogde gebruikers
CREATE POLICY "blok_fiches: lezen" ON blok_fiches FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 4. Schrijfbeleid: admins en coordinatoren
CREATE POLICY "blok_fiches: beheren" ON blok_fiches FOR ALL
  USING (eigen_rol() IN ('admin', 'coordinator'))
  WITH CHECK (eigen_rol() IN ('admin', 'coordinator'));

-- 5. Migreer bestaande fiche_id koppelingen naar de nieuwe tabel
INSERT INTO blok_fiches (blok_id, fiche_id, volgorde)
SELECT id, fiche_id, 0
FROM dag_blokken
WHERE fiche_id IS NOT NULL
ON CONFLICT (blok_id, fiche_id) DO NOTHING;

-- 6. Controle
SELECT
  (SELECT COUNT(*) FROM blok_fiches) AS gemigreerd,
  (SELECT COUNT(*) FROM dag_blokken WHERE fiche_id IS NOT NULL) AS origineel;
