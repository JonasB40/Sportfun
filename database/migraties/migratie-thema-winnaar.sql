-- ============================================================
-- SportFun — Migratie: thema + winnaar op activiteitenfiches
-- + 8 waterspelletjes-fiches vooraf inladen
-- Voer uit in Supabase SQL Editor
-- ============================================================

-- Stap 1: nieuwe kolommen
ALTER TABLE activiteiten_fiches
  ADD COLUMN IF NOT EXISTS thema   text,
  ADD COLUMN IF NOT EXISTS winnaar text;

-- Stap 2: 8 waterspelletjes-fiches inladen (overslaan als naam al bestaat)
DO $$
DECLARE beheerder_id UUID;
BEGIN
  SELECT id INTO beheerder_id
  FROM profielen
  WHERE rol = 'admin'
  ORDER BY aangemaakt_op
  LIMIT 1;

  -- Spons Estafette
  INSERT INTO activiteiten_fiches (naam, thema, categorie, leeftijdsgroep, locatie, moeilijkheid,
    duur_minuten, min_deelnemers, max_deelnemers, doelstelling, spelregels, winnaar,
    materiaal, status, aangemaakt_door)
  SELECT 'Spons Estafette', 'waterspelen', 'teamspel', '6-12j', 'buiten', 'eenvoudig',
    15, 10, 12,
    'De kinderen leren samenwerken, efficiënt communiceren en ontwikkelen hun snelheid en coördinatie door water over te brengen.',
    '1. Verdeel de groep in 2 teams.' || chr(10) ||
    '2. De eerste speler doopt een spons in het water.' || chr(10) ||
    '3. Hij/zij loopt naar de lege emmer en knijpt de spons uit.' || chr(10) ||
    '4. Teruglopen en de spons doorgeven aan de volgende.',
    'Na 5 minuten wint het team met het meeste water in de lege emmer.',
    ARRAY['2 emmers met water', '2 lege emmers', '4 sponzen'],
    'goedgekeurd', beheerder_id
  WHERE NOT EXISTS (SELECT 1 FROM activiteiten_fiches WHERE naam = 'Spons Estafette');

  -- Waterpistool mikken
  INSERT INTO activiteiten_fiches (naam, thema, categorie, leeftijdsgroep, locatie, moeilijkheid,
    duur_minuten, min_deelnemers, max_deelnemers, doelstelling, spelregels, winnaar,
    materiaal, status, aangemaakt_door)
  SELECT 'Waterpistool mikken', 'waterspelen', 'teamspel', '6-12j', 'buiten', 'eenvoudig',
    15, 10, 12,
    'Stimuleert concentratie, oog-handcoördinatie en gericht samenwerken door nauwkeurig te mikken met een waterpistool.',
    '1. Zet voor elk team een lege beker op een schotel.' || chr(10) ||
    '2. De kinderen staan enkele meters verder.' || chr(10) ||
    '3. Om beurt spuiten ze water in de beker.',
    'Het eerste team waarvan de beker een vooraf aangeduide lijn bereikt.',
    ARRAY['4 waterpistolen', '10 plastic bekers', '2 schotels of dienbladen'],
    'goedgekeurd', beheerder_id
  WHERE NOT EXISTS (SELECT 1 FROM activiteiten_fiches WHERE naam = 'Waterpistool mikken');

  -- Watertransport
  INSERT INTO activiteiten_fiches (naam, thema, categorie, leeftijdsgroep, locatie, moeilijkheid,
    duur_minuten, min_deelnemers, max_deelnemers, doelstelling, spelregels, winnaar,
    materiaal, status, aangemaakt_door)
  SELECT 'Watertransport', 'waterspelen', 'teamspel', '6-12j', 'buiten', 'eenvoudig',
    15, 10, 12,
    'Oefent samenwerking, nauwkeurigheid en taakverdeling waarbij elke speler een belangrijke rol heeft.',
    '1. Kinderen staan in een rij.' || chr(10) ||
    '2. De eerste vult een beker.' || chr(10) ||
    '3. Het water wordt boven het hoofd doorgegeven zonder om te kijken.' || chr(10) ||
    '4. De laatste giet het in een lege emmer.',
    'Na enkele rondes heeft het team met het meeste water gewonnen.',
    ARRAY['12 bekers', '4 emmers'],
    'goedgekeurd', beheerder_id
  WHERE NOT EXISTS (SELECT 1 FROM activiteiten_fiches WHERE naam = 'Watertransport');

  -- Schiet de beker om
  INSERT INTO activiteiten_fiches (naam, thema, categorie, leeftijdsgroep, locatie, moeilijkheid,
    duur_minuten, min_deelnemers, max_deelnemers, doelstelling, spelregels, variaties, winnaar,
    materiaal, status, aangemaakt_door)
  SELECT 'Schiet de beker om', 'waterspelen', 'vrij_spel', '6-12j', 'buiten', 'gemiddeld',
    15, 10, 12,
    'Bevordert nauwkeurigheid, motorische controle en inschattingsvermogen.',
    '1. Zet bekers op schotels.' || chr(10) ||
    '2. Kinderen staan op afstand.' || chr(10) ||
    '3. Ze proberen met hun waterstraal de beker om te schieten.',
    'Geef verschillende afstanden voor verschillende moeilijkheidsgraden.',
    'Degene die alle bekers omver kan schieten.',
    ARRAY['4 waterpistolen', '10 bekers', '2 schotels of dienbladen'],
    'goedgekeurd', beheerder_id
  WHERE NOT EXISTS (SELECT 1 FROM activiteiten_fiches WHERE naam = 'Schiet de beker om');

  -- Sponswerpen
  INSERT INTO activiteiten_fiches (naam, thema, categorie, leeftijdsgroep, locatie, moeilijkheid,
    duur_minuten, min_deelnemers, max_deelnemers, doelstelling, spelregels, variaties, winnaar,
    materiaal, status, aangemaakt_door)
  SELECT 'Sponswerpen', 'waterspelen', 'vrij_spel', '6-12j', 'buiten', 'eenvoudig',
    15, 10, 12,
    'Stimuleert vaardigheid, concentratie en het inschatten van afstanden.',
    '1. Plaats emmers op verschillende afstanden.' || chr(10) ||
    '2. Kinderen gooien de sponzen in de emmers.',
    'Puntentelling: dichtbij = 3 punten, middel = 2 punten, ver = 1 punt.',
    'Degene die de meeste punten scoort.',
    ARRAY['natte sponzen', 'emmers of bakken'],
    'goedgekeurd', beheerder_id
  WHERE NOT EXISTS (SELECT 1 FROM activiteiten_fiches WHERE naam = 'Sponswerpen');

  -- Waterbom
  INSERT INTO activiteiten_fiches (naam, thema, categorie, leeftijdsgroep, locatie, moeilijkheid,
    duur_minuten, min_deelnemers, max_deelnemers, doelstelling, spelregels, winnaar,
    materiaal, status, aangemaakt_door)
  SELECT 'Waterbom', 'waterspelen', 'hoofdspel', '6-12j', 'buiten', 'eenvoudig',
    15, 10, 12,
    'Oefent concentratie, reactievermogen en vangvaardigheden.',
    '1. Kinderen staan in een kring.' || chr(10) ||
    '2. Ze gooien een doorweekte spons naar elkaar.' || chr(10) ||
    '3. Wie de spons laat vallen, gaat zitten.',
    'De laatste speler die nog rechtsstaat is de winnaar.',
    ARRAY['2 grote sponzen'],
    'goedgekeurd', beheerder_id
  WHERE NOT EXISTS (SELECT 1 FROM activiteiten_fiches WHERE naam = 'Waterbom');

  -- Sponstikkertje
  INSERT INTO activiteiten_fiches (naam, thema, categorie, leeftijdsgroep, locatie, moeilijkheid,
    duur_minuten, min_deelnemers, max_deelnemers, doelstelling, spelregels, variaties, winnaar,
    materiaal, status, aangemaakt_door)
  SELECT 'Sponstikkertje', 'waterspelen', 'hoofdspel', '6-12j', 'buiten', 'eenvoudig',
    15, 10, 12,
    'Stimuleert reactievermogen, snelheid, ruimtelijk inzicht en spelplezier.',
    '1. Een tikker krijgt de spons.' || chr(10) ||
    '2. Wie geraakt wordt met de spons, wordt de nieuwe tikker.' || chr(10) ||
    '3. De spons mag niet gegooid worden, enkel zacht aantikken.',
    'Maak een veilige zone waar kinderen 10 seconden mogen rusten.',
    'Degene die als laatste overblijft zonder getikt te worden.',
    ARRAY['1 natte spons'],
    'goedgekeurd', beheerder_id
  WHERE NOT EXISTS (SELECT 1 FROM activiteiten_fiches WHERE naam = 'Sponstikkertje');

  -- Waterrace
  INSERT INTO activiteiten_fiches (naam, thema, categorie, leeftijdsgroep, locatie, moeilijkheid,
    duur_minuten, min_deelnemers, max_deelnemers, doelstelling, spelregels, winnaar,
    materiaal, status, aangemaakt_door)
  SELECT 'Waterrace', 'waterspelen', 'teamspel', '6-12j', 'buiten', 'eenvoudig',
    15, 10, 12,
    'Oefent evenwicht, snelheid en coördinatie in een slalomparcours.',
    '1. Maak een slalomparcours met kegels.' || chr(10) ||
    '2. Kinderen lopen met een volle beker door het parcours.' || chr(10) ||
    '3. Daarna geven ze de beker door aan de volgende speler.',
    'Het team dat het snelst klaar is én nog het meeste water over heeft.',
    ARRAY['bekers', 'kegels'],
    'goedgekeurd', beheerder_id
  WHERE NOT EXISTS (SELECT 1 FROM activiteiten_fiches WHERE naam = 'Waterrace');

END $$;

-- Controle
SELECT naam, thema, status
FROM activiteiten_fiches
WHERE thema = 'waterspelen'
ORDER BY naam;
