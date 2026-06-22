-- ============================================================
-- SportFun Portaal — Databaseschema
-- Voer dit script uit in de Supabase SQL Editor
-- ============================================================

-- Schakel UUID extensie in (standaard aanwezig in Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Tabel: profielen ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profielen (
  id              uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  voornaam        text NOT NULL,
  achternaam      text NOT NULL,
  email           text NOT NULL,
  rol             text NOT NULL CHECK (rol IN ('admin', 'coordinator', 'lesgever', 'extra_hulp')),
  telefoon        text,
  adres           text,
  geboortedatum   date,
  uitgenodigd_door uuid REFERENCES profielen(id) ON DELETE SET NULL,
  actief          boolean DEFAULT true,
  aangemaakt_op   timestamptz DEFAULT now()
);

-- ── Tabel: kampen ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kampen (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam              text NOT NULL,
  locatie           text NOT NULL,
  adres             text,
  startdatum        date NOT NULL,
  einddatum         date NOT NULL,
  leeftijdsgroep    text NOT NULL,
  verantwoordelijke uuid REFERENCES profielen(id) ON DELETE SET NULL,
  noodcontact_naam  text,
  noodcontact_tel   text,
  status            text NOT NULL DEFAULT 'concept'
                    CHECK (status IN ('concept', 'actief', 'afgelopen')),
  aangemaakt_op     timestamptz DEFAULT now()
);

-- ── Tabel: kamp_lesgevers ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kamp_lesgevers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kamp_id      uuid NOT NULL REFERENCES kampen(id) ON DELETE CASCADE,
  lesgever_id  uuid NOT NULL REFERENCES profielen(id) ON DELETE CASCADE,
  gekoppeld_op timestamptz DEFAULT now(),
  UNIQUE (kamp_id, lesgever_id)
);

-- ── Tabel: beschikbaarheden ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS beschikbaarheden (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesgever_id         uuid NOT NULL REFERENCES profielen(id) ON DELETE CASCADE,
  kamp_id             uuid NOT NULL REFERENCES kampen(id) ON DELETE CASCADE,
  beschikbaar         boolean DEFAULT true,
  onbeschikbare_dagen date[] DEFAULT '{}',
  opmerking           text,
  ingediend_op        timestamptz DEFAULT now(),
  UNIQUE (lesgever_id, kamp_id)
);

-- ── Tabel: activiteiten_fiches ───────────────────────────────────
CREATE TABLE IF NOT EXISTS activiteiten_fiches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam            text NOT NULL,
  spelregels      text NOT NULL,
  variaties       text,
  materiaal       text[] DEFAULT '{}',
  leeftijdsgroep  text NOT NULL,
  duur_minuten    int CHECK (duur_minuten > 0),
  min_deelnemers  int CHECK (min_deelnemers > 0),
  max_deelnemers  int CHECK (max_deelnemers > 0),
  locatie         text DEFAULT 'beide'
                  CHECK (locatie IN ('binnen', 'buiten', 'beide')),
  categorie       text CHECK (categorie IN (
                    'warming-up', 'hoofdspel', 'rustig_spel',
                    'afsluiter', 'teamspel', 'vrij_spel'
                  )),
  moeilijkheid    text DEFAULT 'gemiddeld'
                  CHECK (moeilijkheid IN ('eenvoudig', 'gemiddeld', 'uitdagend')),
  doelstelling    text,
  fotos           text[] DEFAULT '{}',
  status          text NOT NULL DEFAULT 'voorstel'
                  CHECK (status IN ('voorstel', 'goedgekeurd', 'afgekeurd')),
  aangemaakt_door uuid REFERENCES profielen(id) ON DELETE SET NULL,
  aangemaakt_op   timestamptz DEFAULT now()
);

-- ── Tabel: dagprogrammas ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dagprogrammas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kamp_id        uuid NOT NULL REFERENCES kampen(id) ON DELETE CASCADE,
  datum          date NOT NULL,
  aangemaakt_door uuid REFERENCES profielen(id) ON DELETE SET NULL,
  aangemaakt_op  timestamptz DEFAULT now(),
  UNIQUE (kamp_id, datum)
);

-- ── Tabel: dagprogramma_fiches ───────────────────────────────────
CREATE TABLE IF NOT EXISTS dagprogramma_fiches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dagprogramma_id  uuid NOT NULL REFERENCES dagprogrammas(id) ON DELETE CASCADE,
  fiche_id         uuid REFERENCES activiteiten_fiches(id) ON DELETE SET NULL,
  volgorde         int NOT NULL DEFAULT 1,
  tijdstip         time,
  notitie          text
);

-- ── Tabel: contracten ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracten (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesgever_id       uuid NOT NULL REFERENCES profielen(id) ON DELETE CASCADE,
  kamp_id           uuid NOT NULL REFERENCES kampen(id) ON DELETE CASCADE,
  gegenereerd_op    timestamptz DEFAULT now(),
  ondertekend       boolean DEFAULT false,
  ondertekend_op    timestamptz,
  contract_inhoud   text,
  UNIQUE (lesgever_id, kamp_id)
);

-- ── Tabel: uitnodigingen ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uitnodigingen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL,
  rol             text NOT NULL,
  token           text UNIQUE NOT NULL,
  uitgenodigd_door uuid REFERENCES profielen(id) ON DELETE SET NULL,
  gebruikt        boolean DEFAULT false,
  vervalt_op      timestamptz DEFAULT (now() + INTERVAL '7 days'),
  aangemaakt_op   timestamptz DEFAULT now()
);

-- ── Tabel: notificaties ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notificaties (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gebruiker_id  uuid NOT NULL REFERENCES profielen(id) ON DELETE CASCADE,
  type          text,
  bericht       text,
  gelezen       boolean DEFAULT false,
  link          text,
  aangemaakt_op timestamptz DEFAULT now()
);

-- ── Indexen ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kamp_lesgevers_kamp    ON kamp_lesgevers(kamp_id);
CREATE INDEX IF NOT EXISTS idx_kamp_lesgevers_lg      ON kamp_lesgevers(lesgever_id);
CREATE INDEX IF NOT EXISTS idx_beschikbaarheden_lg    ON beschikbaarheden(lesgever_id);
CREATE INDEX IF NOT EXISTS idx_beschikbaarheden_kamp  ON beschikbaarheden(kamp_id);
CREATE INDEX IF NOT EXISTS idx_dagprogrammas_kamp     ON dagprogrammas(kamp_id);
CREATE INDEX IF NOT EXISTS idx_dagprog_fiches_dag     ON dagprogramma_fiches(dagprogramma_id);
CREATE INDEX IF NOT EXISTS idx_contracten_lg          ON contracten(lesgever_id);
CREATE INDEX IF NOT EXISTS idx_notificaties_gebruiker ON notificaties(gebruiker_id);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE profielen           ENABLE ROW LEVEL SECURITY;
ALTER TABLE kampen               ENABLE ROW LEVEL SECURITY;
ALTER TABLE kamp_lesgevers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE beschikbaarheden     ENABLE ROW LEVEL SECURITY;
ALTER TABLE activiteiten_fiches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE dagprogrammas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dagprogramma_fiches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracten           ENABLE ROW LEVEL SECURITY;
ALTER TABLE uitnodigingen        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaties         ENABLE ROW LEVEL SECURITY;

-- Hulpfunctie: haal de rol van de ingelogde gebruiker op
CREATE OR REPLACE FUNCTION eigen_rol()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT rol FROM profielen WHERE id = auth.uid();
$$;

-- ── Policies: profielen ──────────────────────────────────────────

-- Eigen profiel altijd leesbaar
CREATE POLICY "Profiel: eigen lezen"
  ON profielen FOR SELECT
  USING (id = auth.uid() OR eigen_rol() IN ('admin', 'coordinator'));

-- Beheerders zien alle profielen
CREATE POLICY "Profiel: beheerder alles lezen"
  ON profielen FOR SELECT
  USING (eigen_rol() IN ('admin', 'coordinator'));

-- Iedereen kan eigen profiel bijwerken
CREATE POLICY "Profiel: eigen bijwerken"
  ON profielen FOR UPDATE
  USING (id = auth.uid());

-- Alleen admins kunnen profielen aanmaken (via trigger of edge function)
CREATE POLICY "Profiel: admin aanmaken"
  ON profielen FOR INSERT
  WITH CHECK (eigen_rol() = 'admin' OR auth.uid() = id);

-- Alleen admins kunnen rollen wijzigen (ruimere update voor beheerders)
CREATE POLICY "Profiel: admin alle bijwerken"
  ON profielen FOR UPDATE
  USING (eigen_rol() IN ('admin', 'coordinator'));

-- ── Policies: kampen ─────────────────────────────────────────────

-- Lesgevers zien kampen waaraan ze gekoppeld zijn
CREATE POLICY "Kampen: lesgever eigen zien"
  ON kampen FOR SELECT
  USING (
    eigen_rol() IN ('admin', 'coordinator')
    OR id IN (
      SELECT kamp_id FROM kamp_lesgevers WHERE lesgever_id = auth.uid()
    )
  );

-- Beheerders kunnen kampen aanmaken en bewerken
CREATE POLICY "Kampen: beheerder schrijven"
  ON kampen FOR ALL
  USING (eigen_rol() IN ('admin', 'coordinator'));

-- ── Policies: kamp_lesgevers ─────────────────────────────────────

CREATE POLICY "KampLesgevers: eigen zien"
  ON kamp_lesgevers FOR SELECT
  USING (
    lesgever_id = auth.uid()
    OR eigen_rol() IN ('admin', 'coordinator')
  );

CREATE POLICY "KampLesgevers: beheerder schrijven"
  ON kamp_lesgevers FOR ALL
  USING (eigen_rol() IN ('admin', 'coordinator'));

-- ── Policies: beschikbaarheden ───────────────────────────────────

CREATE POLICY "Beschikbaar: eigen lezen en schrijven"
  ON beschikbaarheden FOR ALL
  USING (
    lesgever_id = auth.uid()
    OR eigen_rol() IN ('admin', 'coordinator')
  );

-- ── Policies: activiteiten_fiches ────────────────────────────────

-- Goedgekeurde fiches zijn leesbaar voor alle ingelogde gebruikers
CREATE POLICY "Fiches: goedgekeurd iedereen lezen"
  ON activiteiten_fiches FOR SELECT
  USING (
    status = 'goedgekeurd'
    OR aangemaakt_door = auth.uid()
    OR eigen_rol() IN ('admin', 'coordinator')
  );

-- Iedereen kan fiches voorstellen
CREATE POLICY "Fiches: iedereen aanmaken"
  ON activiteiten_fiches FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Aanmaker kan eigen voorstel bewerken; beheerders alles
CREATE POLICY "Fiches: eigen of beheerder bijwerken"
  ON activiteiten_fiches FOR UPDATE
  USING (
    aangemaakt_door = auth.uid()
    OR eigen_rol() IN ('admin', 'coordinator')
  );

-- ── Policies: dagprogrammas ──────────────────────────────────────

CREATE POLICY "Dagprog: lezen via kamp"
  ON dagprogrammas FOR SELECT
  USING (
    eigen_rol() IN ('admin', 'coordinator')
    OR kamp_id IN (
      SELECT kamp_id FROM kamp_lesgevers WHERE lesgever_id = auth.uid()
    )
  );

CREATE POLICY "Dagprog: beheerder schrijven"
  ON dagprogrammas FOR ALL
  USING (eigen_rol() IN ('admin', 'coordinator'));

-- ── Policies: dagprogramma_fiches ────────────────────────────────

CREATE POLICY "DagprogFiches: lezen via dagprogramma"
  ON dagprogramma_fiches FOR SELECT
  USING (
    eigen_rol() IN ('admin', 'coordinator')
    OR dagprogramma_id IN (
      SELECT d.id FROM dagprogrammas d
      JOIN kamp_lesgevers kl ON kl.kamp_id = d.kamp_id
      WHERE kl.lesgever_id = auth.uid()
    )
  );

CREATE POLICY "DagprogFiches: beheerder schrijven"
  ON dagprogramma_fiches FOR ALL
  USING (eigen_rol() IN ('admin', 'coordinator'));

-- ── Policies: contracten ─────────────────────────────────────────

CREATE POLICY "Contracten: eigen lezen"
  ON contracten FOR SELECT
  USING (
    lesgever_id = auth.uid()
    OR eigen_rol() IN ('admin', 'coordinator')
  );

CREATE POLICY "Contracten: eigen ondertekenen"
  ON contracten FOR UPDATE
  USING (lesgever_id = auth.uid() OR eigen_rol() IN ('admin', 'coordinator'));

CREATE POLICY "Contracten: beheerder aanmaken"
  ON contracten FOR INSERT
  WITH CHECK (eigen_rol() IN ('admin', 'coordinator'));

-- ── Policies: uitnodigingen ──────────────────────────────────────

CREATE POLICY "Uitnodigingen: beheerder alles"
  ON uitnodigingen FOR ALL
  USING (eigen_rol() IN ('admin', 'coordinator'));

-- Token validatie bij registratie (publiek leesbaar op token)
CREATE POLICY "Uitnodigingen: token validatie"
  ON uitnodigingen FOR SELECT
  USING (true);

-- ── Policies: notificaties ───────────────────────────────────────

CREATE POLICY "Notificaties: eigen lezen en bijwerken"
  ON notificaties FOR ALL
  USING (gebruiker_id = auth.uid());

CREATE POLICY "Notificaties: systeem aanmaken"
  ON notificaties FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- Trigger: maak profiel automatisch aan na registratie
-- ============================================================

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
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER na_gebruiker_aanmaken
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION maak_profiel_bij_registratie();
