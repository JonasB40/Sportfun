-- ============================================================
-- SportFun Portaal — Demo-data (seed.sql)
--
-- BELANGRIJK: Voer schema.sql EERST uit voor je dit bestand uitvoert.
-- Maak de auth-gebruikers EERST aan via Supabase Auth (dashboard of
-- API), en vervang de UUID's hieronder door de echte UUID's.
--
-- Eenvoudigste methode: maak de gebruikers aan via het Supabase
-- dashboard (Authentication > Users > Add user), kopieer de UUID's
-- en plak ze hieronder vóór je dit script uitvoert.
-- ============================================================

-- ── Tijdelijk RLS uitschakelen voor seed-data ────────────────────
-- (Voer dit alleen lokaal / in ontwikkelomgeving uit)
SET session_replication_role = replica;

-- ── Demo UUID's (vervang door echte auth.users UUID's) ───────────
DO $$
DECLARE
  admin1_id    uuid := '11111111-1111-1111-1111-111111111101';
  admin2_id    uuid := '11111111-1111-1111-1111-111111111102';
  coord1_id    uuid := '11111111-1111-1111-1111-111111111103';
  lg1_id       uuid := '11111111-1111-1111-1111-111111111104';
  lg2_id       uuid := '11111111-1111-1111-1111-111111111105';
  lg3_id       uuid := '11111111-1111-1111-1111-111111111106';
  hulp1_id     uuid := '11111111-1111-1111-1111-111111111107';
  kamp1_id     uuid := gen_random_uuid();
  kamp2_id     uuid := gen_random_uuid();
  kamp3_id     uuid := gen_random_uuid();
  fiche1_id    uuid := gen_random_uuid();
  fiche2_id    uuid := gen_random_uuid();
  fiche3_id    uuid := gen_random_uuid();
  fiche4_id    uuid := gen_random_uuid();
  fiche5_id    uuid := gen_random_uuid();
  fiche6_id    uuid := gen_random_uuid();
  fiche7_id    uuid := gen_random_uuid();
  fiche8_id    uuid := gen_random_uuid();
  fiche9_id    uuid := gen_random_uuid();
  fiche10_id   uuid := gen_random_uuid();
  dagprog1_id  uuid := gen_random_uuid();
  dagprog2_id  uuid := gen_random_uuid();
BEGIN

-- ── Profielen ────────────────────────────────────────────────────
INSERT INTO profielen (id, voornaam, achternaam, email, rol, telefoon, actief) VALUES
  (admin1_id,  'Sofie',   'Vermeersch', 'sofie@sportfun.be',    'admin',      '0477 11 11 11', true),
  (admin2_id,  'Pieter',  'De Smedt',   'pieter@sportfun.be',   'admin',      '0477 22 22 22', true),
  (coord1_id,  'Laura',   'Janssen',    'laura@sportfun.be',    'coordinator','0477 33 33 33', true),
  (lg1_id,     'Tom',     'Claes',      'tom@lesgever.be',      'lesgever',   '0478 44 44 44', true),
  (lg2_id,     'Emma',    'Willems',    'emma@lesgever.be',     'lesgever',   '0478 55 55 55', true),
  (lg3_id,     'Bram',    'Peeters',    'bram@lesgever.be',     'lesgever',   '0478 66 66 66', true),
  (hulp1_id,   'Nathalie','Bogaert',    'nathalie@lesgever.be', 'extra_hulp', '0479 77 77 77', true)
ON CONFLICT (id) DO NOTHING;

-- ── Kampen ───────────────────────────────────────────────────────
INSERT INTO kampen (id, naam, locatie, adres, startdatum, einddatum, leeftijdsgroep, verantwoordelijke, noodcontact_naam, noodcontact_tel, status) VALUES
  (kamp1_id, 'Zomerkamp Gent',   'Sporthal De Brug',    'Brugstraat 12, 9000 Gent',     '2025-07-07', '2025-07-11', '6-9j',    coord1_id, 'Sofie Vermeersch', '0477 11 11 11', 'actief'),
  (kamp2_id, 'Paaskamp Brugge',  'GVBS Het Kompas',     'Kompasstraat 4, 8000 Brugge',  '2025-04-14', '2025-04-18', '2.5-5j',  coord1_id, 'Laura Janssen',    '0477 33 33 33', 'afgelopen'),
  (kamp3_id, 'Herfstdreef Aalst','Sportcentrum Aalst',  'Sportlaan 8, 9300 Aalst',      '2025-10-27', '2025-10-31', '10-12j',  admin1_id, 'Pieter De Smedt',  '0477 22 22 22', 'concept')
ON CONFLICT (id) DO NOTHING;

-- ── Kamp-lesgever koppelingen ────────────────────────────────────
INSERT INTO kamp_lesgevers (kamp_id, lesgever_id) VALUES
  (kamp1_id, lg1_id), (kamp1_id, lg2_id), (kamp1_id, hulp1_id),
  (kamp2_id, lg2_id), (kamp2_id, lg3_id),
  (kamp3_id, lg1_id), (kamp3_id, lg3_id)
ON CONFLICT DO NOTHING;

-- ── Beschikbaarheden ─────────────────────────────────────────────
INSERT INTO beschikbaarheden (lesgever_id, kamp_id, beschikbaar, onbeschikbare_dagen, opmerking) VALUES
  (lg1_id,  kamp1_id, true, '{}', 'Ik ben er de hele week!'),
  (lg2_id,  kamp1_id, true, ARRAY['2025-07-09']::date[], 'Woensdag iets later door doktersafspraak'),
  (lg3_id,  kamp3_id, true, '{}', NULL)
ON CONFLICT DO NOTHING;

-- ── Activiteitenfiches ───────────────────────────────────────────
INSERT INTO activiteiten_fiches (id, naam, spelregels, variaties, materiaal, leeftijdsgroep, duur_minuten, min_deelnemers, max_deelnemers, locatie, categorie, moeilijkheid, doelstelling, status, aangemaakt_door) VALUES
(fiche1_id, 'Vossenjacht',
'1. Één speler is de "vos" en draagt een hesje.
2. Alle andere spelers proberen de vos te vangen door hem aan te tikken.
3. Als de vos gevangen is, wordt de tikker de nieuwe vos.
4. De vos mag niet stilstaan, altijd in beweging blijven.',
'Meerdere vossen tegelijk voor grotere groepen. Veilige zones ("holen") instellen.',
ARRAY['Hesjes (1 per vos)', 'Afbakeningspionnen'],
'6-9j', 20, 8, 30, 'buiten', 'warming-up', 'eenvoudig',
'Reactiesnelheid, ruimtelijk inzicht en teamwork trainen.',
'goedgekeurd', admin1_id),

(fiche2_id, 'Menselijk slagbal',
'1. Verdeel de groep in twee teams: slagteam en veldteam.
2. Het slagteam sloeg de bal (met de hand) en sprint naar de overkant.
3. Het veldteam probeert de bal te vangen en de slager te "branden" voor hij aankomt.
4. Iedereen krijgt om beurten de kans te slaan.',
'Gebruik een zachte foambal. Meerdere bases toevoegen.',
ARRAY['Zachte foambal', 'Pionnen voor bases', 'Afzetlijn'],
'6-9j', 45, 10, 30, 'buiten', 'hoofdspel', 'gemiddeld',
'Coördinatie, samenwerking en sportief gedrag stimuleren.',
'goedgekeurd', admin1_id),

(fiche3_id, 'Stiltebal',
'1. Alle spelers staan in een kring.
2. Eén speler staat in het midden en sluit de ogen.
3. De bal wordt stilletjes doorgegeven in de kring.
4. De middelste speler probeert te horen/voelen waar de bal is en wijst aan.
5. Raak bal gevonden = wissel van plaatsen.',
'Met meerdere ballen tegelijk voor hogere uitdaging.',
ARRAY['Zachte bal'],
'2.5-5j', 15, 5, 20, 'binnen', 'rustig_spel', 'eenvoudig',
'Luistervaardigheid en concentratie ontwikkelen bij kleuters.',
'goedgekeurd', coord1_id),

(fiche4_id, 'Pirateneiland',
'1. Verspreid matten (eilandjes) door de zaal.
2. Muziek speelt: kinderen lopen/dansen vrij door de zaal.
3. Muziek stopt: iedereen zoekt een eilandje.
4. Elke ronde verdwijnt er een mat.
5. Doel: niemand verlaat het spel, iedereen perst samen op de resterende eilandjes.',
'Eilandjes kleiner maken door ze te vouwen. Thema (jungle, piraten) toevoegen.',
ARRAY['Matten of grote kartonnen vellen', 'Muziek (speaker)'],
'2.5-5j', 20, 6, 25, 'binnen', 'hoofdspel', 'eenvoudig',
'Samenwerking, ruimtelijk inzicht en plezier centraal stellen.',
'goedgekeurd', admin1_id),

(fiche5_id, 'Ninja-duel',
'1. Alle spelers staan in een kring en nemen een ninja-pose aan.
2. Om beurten maakt elke speler één beweging: probeer de hand van een buur te tikken.
3. De buur mag één beweging maken om te ontwijken.
4. Wie getikt wordt op de hand, verliest die hand (achter rug).
5. Twee handen weg = uit het spel.',
'Teamversie: elk team behoudt samen handen. Blinde versie met geluiden.',
ARRAY[]::text[],
'10-12j', 15, 6, 20, 'beide', 'warming-up', 'gemiddeld',
'Reflexen, concentratie en sportief verlies accepteren.',
'goedgekeurd', lg1_id),

(fiche6_id, 'Menselijke knoop',
'1. Spelers staan in een kring en pakken elkaars handen (niet van de buur).
2. Zo ontstaat een menselijke knoop.
3. Zonder handen los te laten, proberen ze de knoop te ontwarren.
4. Doel: terug in een kring staan (of twee aparte kringen).',
'Ogen dicht voor extra moeilijkheid. Tijdslimiet instellen.',
ARRAY[]::text[],
'10-12j', 20, 8, 20, 'beide', 'teamspel', 'uitdagend',
'Communicatie, samenwerking en probleemoplossend denken stimuleren.',
'goedgekeurd', lg2_id),

(fiche7_id, 'Stoelendans sportief',
'1. Stoelen in een kring, één minder dan spelers.
2. Muziek speelt, spelers lopen om de stoelen.
3. Muziek stopt: iedereen zoekt een stoel.
4. Wie geen stoel vindt, krijgt een sportopdracht (10 pushups, etc.) en doet mee.
5. Na opdracht meespelen, geen uitval.',
'Opdrachten aanpassen aan leeftijd. Groepsopdrachten voor saamhorigheid.',
ARRAY['Stoelen', 'Muziek', 'Opdrachtkaarten'],
'6-9j', 20, 8, 25, 'binnen', 'rustig_spel', 'eenvoudig',
'Plezier, snelheid en inclusiviteit combineren.',
'goedgekeurd', coord1_id),

(fiche8_id, 'Gevangenenbal',
'1. Twee teams, gescheiden door een middenlijn.
2. Elk team heeft een "gevangenenzone" achteraan.
3. Ballen gooien om tegenstanders te raken. Geraakt = gevangene.
4. Gevangenen kunnen bevrijd worden als een teamgenoot de bal overgooit.
5. Gewonnen als het andere team geen vrije spelers meer heeft.',
'Meerdere ballen voor meer dynamiek. Helperszone voor kleinere kinderen.',
ARRAY['Zachte foamballen (4-6)', 'Pionnen voor zones'],
'10-12j', 40, 12, 35, 'beide', 'hoofdspel', 'gemiddeld',
'Samenwerking, strategisch denken en atletische vaardigheden combineren.',
'goedgekeurd', admin1_id),

(fiche9_id, 'Groepsknuffel afsluiter',
'1. Iedereen staat in een kring.
2. Iedereen zegt één ding dat hij/zij leuk vond vandaag.
3. Daarna een groepsknuffel of high-five cirkel.
4. Afsluiten met een SportFun-chant.',
NULL,
ARRAY[]::text[],
'2.5-5j', 10, 4, 30, 'beide', 'afsluiter', 'eenvoudig',
'Positief afsluiten van de dag en verbinding bevorderen.',
'goedgekeurd', admin1_id),

(fiche10_id, 'Spiegelspel',
'1. Spelers staan in duo''s tegenover elkaar.
2. Eén speler is de "spiegel": volgt alle bewegingen van de ander.
3. Na 2 minuten wisselen.
4. Probeer de spiegel te "breken" door plotse, snelle bewegingen.',
'Groepsspiegel: één leider, iedereen volgt. Muziek toevoegen.',
ARRAY[]::text[],
'6-9j', 15, 4, 30, 'beide', 'warming-up', 'gemiddeld',
'Concentratie, lichaamsbewustzijn en verbinding met partner.',
'voorstel', lg3_id)
ON CONFLICT (id) DO NOTHING;

-- ── Dagprogramma's ───────────────────────────────────────────────
INSERT INTO dagprogrammas (id, kamp_id, datum, aangemaakt_door) VALUES
  (dagprog1_id, kamp1_id, '2025-07-07', coord1_id),
  (dagprog2_id, kamp1_id, '2025-07-08', coord1_id)
ON CONFLICT DO NOTHING;

INSERT INTO dagprogramma_fiches (dagprogramma_id, fiche_id, volgorde, tijdstip, notitie) VALUES
  (dagprog1_id, fiche1_id, 1, '09:30', 'Start buiten als het droog is'),
  (dagprog1_id, fiche2_id, 2, '10:00', NULL),
  (dagprog1_id, fiche7_id, 3, '11:00', 'Na de pauze'),
  (dagprog1_id, fiche9_id, 4, '12:00', 'Afsluiting voor de middag'),
  (dagprog2_id, fiche5_id, 1, '09:30', NULL),
  (dagprog2_id, fiche8_id, 2, '10:00', NULL),
  (dagprog2_id, fiche6_id, 3, '11:15', 'Als het een beetje regent, binnen'),
  (dagprog2_id, fiche9_id, 4, '12:00', NULL)
ON CONFLICT DO NOTHING;

-- ── Contracten ───────────────────────────────────────────────────
INSERT INTO contracten (lesgever_id, kamp_id, ondertekend, ondertekend_op, contract_inhoud) VALUES
  (lg1_id, kamp1_id, true,  '2025-06-15T10:23:00Z', 'VRIJWILLIGERSOVEREENKOMST — SPORTKAMP
──────────────────────────────────────────────────

Tussen:
  SportFun vzw

En:
  Tom Claes
  E-mail: tom@lesgever.be

Kamp: Zomerkamp Gent
Periode: 7 juli 2025 t.e.m. 11 juli 2025
Locatie: Sporthal De Brug
Rol: Lesgever

[Ondertekend digitaal op 15 juni 2025]'),
  (lg2_id, kamp1_id, false, NULL, 'VRIJWILLIGERSOVEREENKOMST — SPORTKAMP
──────────────────────────────────────────────────

Tussen:
  SportFun vzw

En:
  Emma Willems
  E-mail: emma@lesgever.be

Kamp: Zomerkamp Gent
Periode: 7 juli 2025 t.e.m. 11 juli 2025
Locatie: Sporthal De Brug
Rol: Lesgever

[Nog niet ondertekend]')
ON CONFLICT DO NOTHING;

-- ── Notificaties ─────────────────────────────────────────────────
INSERT INTO notificaties (gebruiker_id, type, bericht, gelezen, link) VALUES
  (lg2_id, 'contract_klaar',  'Je contract voor Zomerkamp Gent is klaar om te ondertekenen.', false, 'profiel.html'),
  (lg1_id, 'ingepland',       'Je bent ingepland voor kamp "Zomerkamp Gent".', true, 'planner.html'),
  (lg2_id, 'ingepland',       'Je bent ingepland voor kamp "Zomerkamp Gent".', true, 'planner.html'),
  (lg3_id, 'fiche_goedgekeurd','Je fiche "Spiegelspel" is in behandeling bij een coördinator.', false, 'fiches.html')
ON CONFLICT DO NOTHING;

END $$;

-- Herstel RLS
SET session_replication_role = DEFAULT;
