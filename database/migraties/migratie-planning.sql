-- ============================================================
-- migratie-planning.sql
-- Visueel kampplanningsysteem — SportFun
-- Uitvoeren in Supabase SQL Editor (eenmalig)
-- ============================================================

-- Groepsnamen per kamp (eenmalig instellen)
CREATE TABLE IF NOT EXISTS kamp_groepen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kamp_id uuid NOT NULL REFERENCES kampen(id) ON DELETE CASCADE,
  groep_index smallint NOT NULL,
  naam text NOT NULL,
  UNIQUE(kamp_id, groep_index)
);
ALTER TABLE kamp_groepen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Groepen: lezen" ON kamp_groepen FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Groepen: schrijven" ON kamp_groepen FOR ALL USING (eigen_rol() IN ('admin','coordinator','lesgever','extra_hulp'));

-- Planningsblokken per dag
CREATE TABLE IF NOT EXISTS dag_blokken (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kamp_id uuid NOT NULL REFERENCES kampen(id) ON DELETE CASCADE,
  datum date NOT NULL,
  groep_index smallint NOT NULL DEFAULT -1,
  -- -1 = alle groepen (vooropvang/naopvang/middagpauze)
  -- 0, 1, ... = specifieke groep
  type text NOT NULL CHECK (type IN ('vooropvang','naopvang','middagpauze','pauze','activiteit')),
  start_tijd time NOT NULL,
  eind_tijd time NOT NULL,
  fiche_id uuid REFERENCES activiteiten_fiches(id) ON DELETE SET NULL,
  label text,
  lesgevers uuid[] DEFAULT '{}',
  aangemaakt_op timestamptz DEFAULT now()
);
ALTER TABLE dag_blokken ENABLE ROW LEVEL SECURITY;
CREATE POLICY "DagBlokken: lezen" ON dag_blokken FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "DagBlokken: schrijven" ON dag_blokken FOR ALL USING (eigen_rol() IN ('admin','coordinator','lesgever','extra_hulp'));
