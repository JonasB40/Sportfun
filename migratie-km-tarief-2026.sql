-- ============================================================
-- SportFun — Km-tarief 2026 gelijktrekken naar €0,4449/km
-- Voer uit in Supabase SQL Editor
-- ============================================================
-- Het autotarief stond op twee plekken verschillend: de app-constante
-- en deze tabel (0,4361). We zetten beide op €0,4449/km (autotarief
-- 1/7/2025 – 30/6/2026), zodat automatisch aangemaakte contracten
-- hetzelfde tarief gebruiken als de admin-knop "Auto".
-- ============================================================

UPDATE financiele_limieten
SET km_tarief = 0.4449
WHERE jaar = 2026;

-- Controle
SELECT jaar, max_per_dag, max_per_jaar, km_tarief
FROM financiele_limieten
WHERE jaar = 2026;
