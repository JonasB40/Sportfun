-- ============================================================
-- Migratie: planningsblokken buiten het kampbereik opruimen
-- ============================================================
--
-- Wanneer iemand de datums van een kamp verzette nadat er al planning
-- gemaakt was, bleven de blokken op de oude datums gewoon staan. De
-- planner toont enkel dagen binnen start- en einddatum, dus die blokken
-- waren onzichtbaar in het portaal maar zaten wel nog in de database.
--
-- Vastgesteld op 2026-08-02: 4 rijen in `dag_blokken` van het kamp
-- "Kleuterclub Week 1 — Sombeke" (1 t/m 3 juli 2026) stonden op 2 en 3
-- juni 2026 — vooropvang, middagpauze en naopvang, geen van alle met een
-- fiche eraan. Dat kamp heeft status 'afgelopen', dus er gaat geen
-- lopende planning verloren.
--
-- De oorzaak is weg: `slaKampOp()` in public/js/admin.js ruimt sinds
-- deze wijziging zelf op bij een datumwijziging, en waarschuwt de
-- gebruiker eerst wanneer er werk aan hangt.
--
-- Uitgevoerd op 2026-08-02. De 4 rijen zijn verwijderd; de
-- controlequery in stap 3 gaf daarna 0 terug.
-- ============================================================

-- ── Stap 1: bekijken wat er verdwijnt ───────────────────────────
--
-- Selecteer enkel deze query en klik Run als je eerst wil zien welke
-- rijen geraakt worden. Het hele bestand in één keer draaien mag ook;
-- deze SELECT verandert niets.

SELECT k.naam,
       k.status,
       k.startdatum,
       k.einddatum,
       b.datum,
       b.type,
       b.start_tijd,
       (b.fiche_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM blok_fiches bf WHERE bf.blok_id = b.id)) AS heeft_fiche
  FROM dag_blokken b
  JOIN kampen k ON k.id = b.kamp_id
 WHERE b.datum < k.startdatum
    OR b.datum > k.einddatum
 ORDER BY k.naam, b.datum, b.start_tijd;

-- ── Stap 2: opruimen ────────────────────────────────────────────
--
-- Gekoppelde fiches in `blok_fiches` verdwijnen mee via de cascade op
-- `blok_fiches.blok_id`. Op 2026-08-02 had geen van de 4 rijen een
-- fiche; klopt dat niet meer bij het uitvoeren, dan toont stap 1 dat in
-- de kolom `heeft_fiche` en kan je die rijen eerst apart bekijken.

DELETE FROM dag_blokken b
 USING kampen k
 WHERE k.id = b.kamp_id
   AND (b.datum < k.startdatum OR b.datum > k.einddatum);

-- ── Stap 3: controle ────────────────────────────────────────────
--
-- Hoort 0 terug te geven.

SELECT count(*) AS weesblokken
  FROM dag_blokken b
  JOIN kampen k ON k.id = b.kamp_id
 WHERE b.datum < k.startdatum
    OR b.datum > k.einddatum;

-- ── Ter info: dagprogramma's ────────────────────────────────────
--
-- `dagprogrammas` heeft dezelfde zwakke plek en wordt sinds deze
-- wijziging ook door het portaal opgeruimd. Deze migratie verwijdert er
-- niets: op 2026-08-02 gaf de query hieronder 0 rijen, en een
-- dagprogramma bevat activiteiten die iemand bewust heeft ingepland.
-- Geeft ze later toch rijen terug, bekijk die dan eerst.
--
--   SELECT k.naam, k.status, k.startdatum, k.einddatum, d.datum,
--          (SELECT count(*) FROM dagprogramma_fiches f
--            WHERE f.dagprogramma_id = d.id) AS aantal_fiches
--     FROM dagprogrammas d
--     JOIN kampen k ON k.id = d.kamp_id
--    WHERE d.datum < k.startdatum
--       OR d.datum > k.einddatum
--    ORDER BY k.naam, d.datum;
