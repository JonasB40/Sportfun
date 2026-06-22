-- ============================================================
-- SportFun — Import kampen 2026 (uit sportfun.be)
-- 42 kampen, één per locatie
-- Status: afgelopen = feb + apr (reeds voorbij op 1 juni 2026)
--         actief    = jul + aug (nog komende)
-- Voer uit in Supabase SQL Editor
-- ============================================================

INSERT INTO kampen (naam, locatie, startdatum, einddatum, leeftijdsgroep, status)
VALUES

-- ══════════════════════════════════════════════════
-- KROKUSKAMPEN — 16-20 / 16-18 februari 2026
-- ══════════════════════════════════════════════════

-- 1
('Kleuter Carnavalkamp',
 'Hamme',
 '2026-02-16', '2026-02-20', '2.5-5j', 'afgelopen'),

-- 2
('Kleuterclub — Sint-Niklaas',
 'Sint-Niklaas',
 '2026-02-16', '2026-02-18', '2.5-5j', 'afgelopen'),

-- 3
('Kleuterclub — Sombeke',
 'Sombeke',
 '2026-02-16', '2026-02-18', '2.5-5j', 'afgelopen'),

-- 4
('Kleuterclub — Waasmunster',
 'Waasmunster',
 '2026-02-16', '2026-02-18', '2.5-5j', 'afgelopen'),

-- 5
('Rakkers Omnisportkamp — Sint-Niklaas',
 'Sint-Niklaas',
 '2026-02-16', '2026-02-18', '6-9j', 'afgelopen'),

-- 6
('Rakkers Omnisportkamp — Sombeke',
 'Sombeke',
 '2026-02-16', '2026-02-18', '6-9j', 'afgelopen'),

-- 7
('STEMazing — Waasmunster',
 'Waasmunster',
 '2026-02-16', '2026-02-18', '7-14j', 'afgelopen'),

-- 8
('Teens Omnisport — Sombeke',
 'Sombeke',
 '2026-02-16', '2026-02-18', '10-12j', 'afgelopen'),

-- ══════════════════════════════════════════════════
-- PAASKAMPEN — april 2026
-- ══════════════════════════════════════════════════

-- 9
('Kleuter Sprookjeskamp — Hamme',
 'Hamme',
 '2026-04-13', '2026-04-17', '2.5-5j', 'afgelopen'),

-- 10
('Kleuterclub Week 1 — Sint-Niklaas',
 'Sint-Niklaas',
 '2026-04-07', '2026-04-10', '2.5-5j', 'afgelopen'),

-- 11
('Kleuterclub Week 1 — Sombeke',
 'Sombeke',
 '2026-04-07', '2026-04-10', '2.5-5j', 'afgelopen'),

-- 12
('Kleuterclub Week 1 — Hamme',
 'Hamme',
 '2026-04-07', '2026-04-10', '2.5-5j', 'afgelopen'),

-- 13
('Kleuterclub Week 2 — Sint-Niklaas',
 'Sint-Niklaas',
 '2026-04-13', '2026-04-17', '2.5-5j', 'afgelopen'),

-- 14
('Kleuterclub Week 2 — Sombeke',
 'Sombeke',
 '2026-04-13', '2026-04-17', '2.5-5j', 'afgelopen'),

-- 15
('Rakkers Omnisport Week 1 — Sint-Niklaas',
 'Sint-Niklaas',
 '2026-04-07', '2026-04-10', '6-9j', 'afgelopen'),

-- 16
('Rakkers Omnisport Week 1 — Hamme',
 'Hamme',
 '2026-04-07', '2026-04-10', '6-9j', 'afgelopen'),

-- 17
('Rakkers Omnisport Week 2 — Sint-Niklaas',
 'Sint-Niklaas',
 '2026-04-13', '2026-04-17', '6-9j', 'afgelopen'),

-- 18
('Rakkers Voetbalkamp — Sombeke',
 'Sombeke',
 '2026-04-13', '2026-04-15', '6-9j', 'afgelopen'),

-- 19
('STEMazing — Sint-Niklaas',
 'Sint-Niklaas',
 '2026-04-13', '2026-04-17', '7-14j', 'afgelopen'),

-- ══════════════════════════════════════════════════
-- ZOMERKAMPEN JULI 2026
-- ══════════════════════════════════════════════════

-- 20
('Kleuterclub Week 1 — Sombeke',
 'Sombeke',
 '2026-07-01', '2026-07-03', '2.5-5j', 'actief'),

-- 21
('Kleuterclub Week 2 — Sint-Niklaas',
 'Sint-Niklaas',
 '2026-07-06', '2026-07-10', '2.5-5j', 'actief'),

-- 22
('Kleuterclub Week 2 — Sombeke',
 'Sombeke',
 '2026-07-06', '2026-07-10', '2.5-5j', 'actief'),

-- 23
('Kleuterclub Week 2 — Hamme',
 'Hamme',
 '2026-07-06', '2026-07-10', '2.5-5j', 'actief'),

-- 24
('Rakkers Omnisportkamp — Sint-Niklaas',
 'Sint-Niklaas',
 '2026-07-06', '2026-07-10', '6-9j', 'actief'),

-- 25
('Rakkers Omnisportkamp — Sombeke',
 'Sombeke',
 '2026-07-06', '2026-07-10', '6-9j', 'actief'),

-- 26
('Rakkers Omnisportkamp — Hamme',
 'Hamme',
 '2026-07-06', '2026-07-10', '6-9j', 'actief'),

-- 27
('STEMazing — Waasmunster',
 'Waasmunster',
 '2026-07-06', '2026-07-10', '9-14j', 'actief'),

-- 28
('Teens Omnisportkamp — Sint-Niklaas',
 'Sint-Niklaas',
 '2026-07-06', '2026-07-10', '10-12j', 'actief'),

-- 29
('Teens Omnisportkamp — Sombeke',
 'Sombeke',
 '2026-07-06', '2026-07-10', '10-12j', 'actief'),

-- ══════════════════════════════════════════════════
-- ZOMERKAMPEN AUGUSTUS 2026
-- ══════════════════════════════════════════════════

-- 30
('Kleuters Boerderijkamp — Sint-Niklaas',
 'Sint-Niklaas',
 '2026-08-03', '2026-08-07', '2.5-5j', 'actief'),

-- 31
('Rakkers Boerderijkamp — Sint-Niklaas',
 'Sint-Niklaas',
 '2026-08-03', '2026-08-07', '6-9j', 'actief'),

-- 32
('Kleuterclub — Sint-Niklaas',
 'Sint-Niklaas',
 '2026-08-10', '2026-08-14', '2.5-5j', 'actief'),

-- 33
('Kleuterclub — Sombeke',
 'Sombeke',
 '2026-08-10', '2026-08-14', '2.5-5j', 'actief'),

-- 34
('Kleuterclub — Waasmunster',
 'Waasmunster',
 '2026-08-10', '2026-08-14', '2.5-5j', 'actief'),

-- 35
('Rakkers Omnisportkamp — Sint-Niklaas',
 'Sint-Niklaas',
 '2026-08-10', '2026-08-14', '6-9j', 'actief'),

-- 36
('Rakkers Omnisportkamp — Sombeke',
 'Sombeke',
 '2026-08-10', '2026-08-14', '6-9j', 'actief'),

-- 37
('Rakkers Voetbalkamp — Sombeke',
 'Sombeke',
 '2026-08-10', '2026-08-14', '6-9j', 'actief'),

-- 38
('STEMazing — Waasmunster',
 'Waasmunster',
 '2026-08-10', '2026-08-14', '9-14j', 'actief'),

-- 39
('Teens Omnisportkamp — Sint-Niklaas',
 'Sint-Niklaas',
 '2026-08-10', '2026-08-14', '10-12j', 'actief'),

-- 40
('Teens Omnisportkamp — Sombeke',
 'Sombeke',
 '2026-08-10', '2026-08-14', '10-12j', 'actief'),

-- 41
('Kleuterkamp Reis rond de wereld — Hamme',
 'Hamme',
 '2026-08-17', '2026-08-21', '2.5-5j', 'actief'),

-- 42
('Rakkers Omnisportkamp — Hamme',
 'Hamme',
 '2026-08-17', '2026-08-21', '6-12j', 'actief');

-- ══════════════════════════════════════════════════
-- Controleer het resultaat
-- ══════════════════════════════════════════════════
SELECT
  ROW_NUMBER() OVER (ORDER BY startdatum, naam) AS nr,
  naam,
  locatie,
  startdatum,
  einddatum,
  leeftijdsgroep,
  status
FROM kampen
ORDER BY startdatum, naam;
