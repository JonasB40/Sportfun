-- ============================================================
-- SportFun — Migratie: rekeningnummer + handtekening
-- Voer dit uit in de Supabase SQL Editor
-- ============================================================

-- 1. Nieuwe kolommen op profielen
ALTER TABLE profielen
  ADD COLUMN IF NOT EXISTS rekeningnummer text,
  ADD COLUMN IF NOT EXISTS handtekening_url text;

-- 2. Storage-bucket aanmaken voor handtekeningen
-- (doe dit ook via Dashboard > Storage > New bucket: "handtekeningen", Public = OFF)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'handtekeningen',
  'handtekeningen',
  false,
  5242880,  -- 5 MB max
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS: elke ingelogde gebruiker mag enkel zijn eigen map lezen/schrijven
DROP POLICY IF EXISTS "Handtekening: eigen upload"    ON storage.objects;
DROP POLICY IF EXISTS "Handtekening: eigen lezen"     ON storage.objects;
DROP POLICY IF EXISTS "Handtekening: eigen overschrijven" ON storage.objects;
DROP POLICY IF EXISTS "Handtekening: eigen verwijderen"   ON storage.objects;
DROP POLICY IF EXISTS "Handtekening: beheerder lezen" ON storage.objects;

CREATE POLICY "Handtekening: eigen upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'handtekeningen'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Handtekening: eigen lezen"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'handtekeningen'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Handtekening: eigen overschrijven"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'handtekeningen'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Handtekening: eigen verwijderen"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'handtekeningen'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Beheerders mogen alle handtekeningen inzien (voor contracten)
CREATE POLICY "Handtekening: beheerder lezen"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'handtekeningen'
    AND EXISTS (
      SELECT 1 FROM public.profielen
      WHERE id = auth.uid() AND rol IN ('admin', 'coordinator')
    )
  );
