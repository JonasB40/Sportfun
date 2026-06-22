-- ============================================================
-- Attest van goed gedrag en zeden type 2
-- Voer uit via: Supabase Dashboard > SQL Editor
-- Script is idempotent: veilig meerdere keren uitvoeren
-- ============================================================

-- 0. Voeg attest-kolommen toe aan profielen
ALTER TABLE public.profielen
  ADD COLUMN IF NOT EXISTS attest_url   text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS attest_datum date    DEFAULT NULL;

-- 1. Maak de privé-bucket aan (public = false: enkel via signed URL te bekijken)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attesten',
  'attesten',
  false,
  10485760,  -- 10 MB maximale bestandsgrootte
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS-policies op storage.objects
--    DROP IF EXISTS zodat het script veilig heruitgevoerd kan worden

DROP POLICY IF EXISTS "attesten_lezen"     ON storage.objects;
DROP POLICY IF EXISTS "attesten_uploaden"  ON storage.objects;
DROP POLICY IF EXISTS name ON storage.objects;
DROP POLICY IF EXISTS "attesten_bijwerken" ON storage.objects;
DROP POLICY IF EXISTS "attesten_verwijderen" ON storage.objects;

-- Lezen: eigen attest OF admin/coördinator
-- Pad-formaat: {user_id}/attest.pdf → eerste map-segment = user_id
CREATE POLICY "attesten_lezen"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'attesten'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profielen
      WHERE id = auth.uid() AND rol IN ('admin', 'coordinator')
    )
  )
);

-- Uploaden (eerste upload): enkel naar eigen map
CREATE POLICY "attesten_uploaden"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attesten'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Bijwerken (upsert = bestaand attest vervangen): enkel eigen map
CREATE POLICY "attesten_bijwerken"
ON storage.objects FOR UPDATE
TO authenticated
USING  ((storage.foldername(name))[1] = auth.uid()::text AND bucket_id = 'attesten')
WITH CHECK ((storage.foldername(name))[1] = auth.uid()::text AND bucket_id = 'attesten');

-- Verwijderen: eigen map OF admin/coördinator
CREATE POLICY "attesten_verwijderen"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'attesten'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profielen
      WHERE id = auth.uid() AND rol IN ('admin', 'coordinator')
    )
  )
);
