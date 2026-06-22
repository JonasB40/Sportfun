-- ============================================================
-- Migratie: Materiaalcategorieën
-- Maak een opzoektabel aan die trefwoorden koppelt aan een
-- materiaalsectie, zodat de materiaallijst gesorteerd kan
-- worden per categorie.
-- ============================================================

-- Categorieën: sport | water | knutsel | muziek | spel | natuur | veiligheid | diversen

CREATE TABLE IF NOT EXISTS materialen_categorieen (
  trefwoord   text PRIMARY KEY,
  categorie   text NOT NULL CHECK (categorie IN (
    'sport', 'water', 'knutsel', 'muziek', 'spel', 'natuur', 'veiligheid', 'diversen'
  ))
);

-- RLS: leesbaar voor iedereen (geverifieerde gebruikers), schrijven enkel admin
ALTER TABLE materialen_categorieen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Alle geverifieerden kunnen categorieën lezen" ON materialen_categorieen;
CREATE POLICY "Alle geverifieerden kunnen categorieën lezen"
  ON materialen_categorieen FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins kunnen categorieën beheren" ON materialen_categorieen;
CREATE POLICY "Admins kunnen categorieën beheren"
  ON materialen_categorieen FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profielen WHERE id = auth.uid() AND rol = 'admin')
  );

-- ── Seed: Sportmateriaal ──────────────────────────────────────────────
INSERT INTO materialen_categorieen (trefwoord, categorie) VALUES
  ('bal',             'sport'),
  ('ballen',          'sport'),
  ('voetbal',         'sport'),
  ('basketbal',       'sport'),
  ('tennisbal',       'sport'),
  ('beachbal',        'sport'),
  ('schuimbal',       'sport'),
  ('dodgeball',       'sport'),
  ('racket',          'sport'),
  ('badmintonracket', 'sport'),
  ('shuttlecock',     'sport'),
  ('frisbee',         'sport'),
  ('springtouw',      'sport'),
  ('springtouwen',    'sport'),
  ('hoepel',          'sport'),
  ('hoelahoep',       'sport'),
  ('hoelahoepen',     'sport'),
  ('cone',            'sport'),
  ('cones',           'sport'),
  ('pylon',           'sport'),
  ('pylonen',         'sport'),
  ('doel',            'sport'),
  ('doeltje',         'sport'),
  ('doeltjes',        'sport'),
  ('doelpaal',        'sport'),
  ('net',             'sport'),
  ('hindernissen',    'sport'),
  ('parcours',        'sport'),
  ('skipper',         'sport'),
  ('kegel',           'sport'),
  ('kegels',          'sport'),
  ('fietsen',         'sport'),
  ('loopband',        'sport'),
  ('estafettestok',   'sport'),
  ('estafette',       'sport'),
  ('touwspringen',    'sport'),
  ('turnmat',         'sport'),
  ('mat',             'sport'),
  ('matten',          'sport')
ON CONFLICT (trefwoord) DO UPDATE SET categorie = EXCLUDED.categorie;

-- ── Seed: Waterspelletjes ─────────────────────────────────────────────
INSERT INTO materialen_categorieen (trefwoord, categorie) VALUES
  ('emmer',           'water'),
  ('emmers',          'water'),
  ('spons',           'water'),
  ('sponzen',         'water'),
  ('waterpistool',    'water'),
  ('waterpistolen',   'water'),
  ('waterballon',     'water'),
  ('waterballonnen',  'water'),
  ('waterbom',        'water'),
  ('waterbommen',     'water'),
  ('waterslang',      'water'),
  ('zwembad',         'water'),
  ('opblaaszwembad',  'water'),
  ('bassin',          'water'),
  ('gieter',          'water'),
  ('gieters',         'water'),
  ('waterkanon',      'water'),
  ('bad',             'water'),
  ('planschebad',     'water'),
  ('watertank',       'water')
ON CONFLICT (trefwoord) DO UPDATE SET categorie = EXCLUDED.categorie;

-- ── Seed: Knutselmateriaal ────────────────────────────────────────────
INSERT INTO materialen_categorieen (trefwoord, categorie) VALUES
  ('verf',            'knutsel'),
  ('penseel',         'knutsel'),
  ('penselen',        'knutsel'),
  ('kwast',           'knutsel'),
  ('kwastjes',        'knutsel'),
  ('karton',          'knutsel'),
  ('papier',          'knutsel'),
  ('lijm',            'knutsel'),
  ('schaar',          'knutsel'),
  ('scharen',         'knutsel'),
  ('stift',           'knutsel'),
  ('stiften',         'knutsel'),
  ('kleurpotloden',   'knutsel'),
  ('potlood',         'knutsel'),
  ('potloden',        'knutsel'),
  ('krijt',           'knutsel'),
  ('canvas',          'knutsel'),
  ('klei',            'knutsel'),
  ('glitter',         'knutsel'),
  ('pailletten',      'knutsel'),
  ('tape',            'knutsel'),
  ('washi',           'knutsel'),
  ('masker',          'knutsel'),
  ('maskers',         'knutsel'),
  ('knutselmateriaal','knutsel'),
  ('tekenblad',       'knutsel'),
  ('tekenbladen',     'knutsel'),
  ('verfpotjes',      'knutsel'),
  ('verfpot',         'knutsel'),
  ('tempera',         'knutsel'),
  ('plakband',        'knutsel'),
  ('schetsblok',      'knutsel'),
  ('confetti',        'knutsel')
ON CONFLICT (trefwoord) DO UPDATE SET categorie = EXCLUDED.categorie;

-- ── Seed: Muziek & Dans ───────────────────────────────────────────────
INSERT INTO materialen_categorieen (trefwoord, categorie) VALUES
  ('speaker',         'muziek'),
  ('bluetoothspeaker','muziek'),
  ('muziekbox',       'muziek'),
  ('trommel',         'muziek'),
  ('tamboerijn',      'muziek'),
  ('tamboerijnnen',   'muziek'),
  ('fluit',           'muziek'),
  ('lint',            'muziek'),
  ('linten',          'muziek'),
  ('sjerpje',         'muziek'),
  ('sjerpjes',        'muziek'),
  ('lintje',          'muziek'),
  ('lintjes',         'muziek'),
  ('pompom',          'muziek'),
  ('pompon',          'muziek'),
  ('muziekspeler',    'muziek')
ON CONFLICT (trefwoord) DO UPDATE SET categorie = EXCLUDED.categorie;

-- ── Seed: Spelmateriaal ───────────────────────────────────────────────
INSERT INTO materialen_categorieen (trefwoord, categorie) VALUES
  ('kaartspel',       'spel'),
  ('kaartspellen',    'spel'),
  ('speelkaarten',    'spel'),
  ('dobbelsteen',     'spel'),
  ('dobbelstenen',    'spel'),
  ('blinddoek',       'spel'),
  ('blinddoeken',     'spel'),
  ('pion',            'spel'),
  ('pionnen',         'spel'),
  ('spelbord',        'spel'),
  ('bordspel',        'spel'),
  ('legpuzzel',       'spel'),
  ('puzzle',          'spel'),
  ('quiz',            'spel'),
  ('raadselkaarten',  'spel'),
  ('geheugenspel',    'spel'),
  ('bingo',           'spel'),
  ('parachute',       'spel'),
  ('grabbelton',      'spel'),
  ('fiche',           'spel'),
  ('fiches',          'spel')
ON CONFLICT (trefwoord) DO UPDATE SET categorie = EXCLUDED.categorie;

-- ── Seed: Natuur & Avontuur ───────────────────────────────────────────
INSERT INTO materialen_categorieen (trefwoord, categorie) VALUES
  ('touw',            'natuur'),
  ('touwen',          'natuur'),
  ('koord',           'natuur'),
  ('zaklamp',         'natuur'),
  ('zaklampen',       'natuur'),
  ('kompas',          'natuur'),
  ('kompassen',       'natuur'),
  ('verrekijker',     'natuur'),
  ('verrekijkers',    'natuur'),
  ('tentharingen',    'natuur'),
  ('tentharing',      'natuur'),
  ('tent',            'natuur'),
  ('oogmasker',       'natuur'),
  ('loep',            'natuur'),
  ('loepen',          'natuur')
ON CONFLICT (trefwoord) DO UPDATE SET categorie = EXCLUDED.categorie;

-- ── Seed: Veiligheid & EHBO ──────────────────────────────────────────
INSERT INTO materialen_categorieen (trefwoord, categorie) VALUES
  ('ehbo',            'veiligheid'),
  ('ehbo-kist',       'veiligheid'),
  ('pleister',        'veiligheid'),
  ('pleisters',       'veiligheid'),
  ('antisepticum',    'veiligheid'),
  ('desinfectie',     'veiligheid'),
  ('zonnecrème',      'veiligheid'),
  ('zonnebrand',      'veiligheid'),
  ('zonnebrandcrème', 'veiligheid'),
  ('insectenspray',   'veiligheid'),
  ('muggenspray',     'veiligheid'),
  ('verbanddoos',     'veiligheid'),
  ('verbandgaas',     'veiligheid'),
  ('betadine',        'veiligheid'),
  ('jodium',          'veiligheid'),
  ('handschoenen',    'veiligheid'),
  ('mondmasker',      'veiligheid')
ON CONFLICT (trefwoord) DO UPDATE SET categorie = EXCLUDED.categorie;
