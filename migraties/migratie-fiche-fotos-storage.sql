-- ============================================================
-- Supabase Storage bucket voor activiteitenfiche-foto's
-- Voer uit via: Supabase Dashboard > SQL Editor
-- Script is idempotent: veilig meerdere keren uitvoeren
-- ============================================================

-- 0. Voeg fotos-kolom toe aan activiteiten_fiches (array van publieke URLs)
ALTER TABLE activiteiten_fiches
  ADD COLUMN IF NOT EXISTS fotos text[] NOT NULL DEFAULT '{}';

-- 1. Maak de bucket aan (public = foto's zijn leesbaar zonder auth)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fiche-fotos',
  'fiche-fotos',
  true,
  5242880,  -- 5 MB maximale bestandsgrootte
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS-policies op storage.objects
--    DROP IF EXISTS zodat het script veilig heruitgevoerd kan worden

-- Lezen: iedereen mag foto's bekijken (public bucket)
DROP POLICY IF EXISTS "fiche_fotos_lezen"      ON storage.objects;
DROP POLICY IF EXISTS "fiche_fotos_uploaden"   ON storage.objects;
DROP POLICY IF EXISTS "fiche_fotos_verwijderen" ON storage.objects;

CREATE POLICY "fiche_fotos_lezen"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'fiche-fotos');

-- Uploaden: enkel ingelogde gebruikers
CREATE POLICY "fiche_fotos_uploaden"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'fiche-fotos');

-- Verwijderen: enkel admins en coordinatoren
-- (gewone lesgevers mogen nooit foto's van anderen verwijderen)
CREATE POLICY "fiche_fotos_verwijderen"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'fiche-fotos'
  AND EXISTS (
    SELECT 1 FROM public.profielen
    WHERE id  = auth.uid()
    AND   rol IN ('admin', 'coordinator')
  )
);
