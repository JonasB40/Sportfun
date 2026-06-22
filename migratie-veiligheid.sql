-- ============================================================
-- SportFun — Veiligheidsmigratie
-- Voer dit uit in de Supabase SQL Editor
-- ============================================================

-- ── 1. Publieke RPC voor uitnodigingsvalidatie ──────────────
-- Vervangt de publiek-leesbare SELECT policy op uitnodigingen.
-- Anonieme gebruikers kunnen nu ENKEL hun eigen token valideren
-- via deze SECURITY DEFINER functie, zonder toegang tot alle rijen.

CREATE OR REPLACE FUNCTION publiek_valideer_uitnodiging(p_token text)
RETURNS TABLE(
  id              uuid,
  email           text,
  rol             text,
  uitgenodigd_door uuid,
  vervalt_op      timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, email, rol, uitgenodigd_door, vervalt_op
  FROM uitnodigingen
  WHERE token    = p_token
    AND gebruikt = false
    AND vervalt_op > now()
  LIMIT 1;
$$;

-- Publieke execute-rechten zodat anonieme gebruikers de functie kunnen aanroepen
GRANT EXECUTE ON FUNCTION publiek_valideer_uitnodiging(text) TO anon, authenticated;

-- ── 2. Verwijder de volledige publieke leestoegang op uitnodigingen ──
-- De tabel is nu enkel leesbaar voor admins/coordinatoren.
-- Anonieme registraties verlopen via publiek_valideer_uitnodiging().

DROP POLICY IF EXISTS "Uitnodigingen: token lezen"  ON uitnodigingen;
DROP POLICY IF EXISTS "Uitnodigingen: token validatie" ON uitnodigingen;

-- Alleen beheerders kunnen de tabel rechtstreeks raadplegen
CREATE POLICY "Uitnodigingen: beheerder lezen"
  ON uitnodigingen FOR SELECT
  USING (eigen_rol() IN ('admin', 'coordinator'));

-- ── 3. Trigger: ON CONFLICT DO NOTHING ────────────────────────
-- Als de admin het profiel al via upsert heeft aangemaakt voordat
-- de trigger vuurt, geeft ON CONFLICT DO NOTHING geen fout meer.

CREATE OR REPLACE FUNCTION maak_profiel_bij_registratie()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profielen (id, voornaam, achternaam, email, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'voornaam', 'Nieuw'),
    COALESCE(NEW.raw_user_meta_data->>'achternaam', 'Teamlid'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'rol', 'lesgever')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── 4. Notificaties: NOT NULL constraint op bericht ────────────
-- Voorkomt lege notificaties die een lege <div> tonen in de UI.

ALTER TABLE notificaties
  ALTER COLUMN bericht SET NOT NULL,
  ALTER COLUMN bericht SET DEFAULT '';

ALTER TABLE notificaties
  ADD CONSTRAINT notificaties_bericht_niet_leeg
  CHECK (bericht <> '');

-- ── Controleer ────────────────────────────────────────────────
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'publiek_valideer_uitnodiging';

SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'uitnodigingen'
ORDER BY policyname;
