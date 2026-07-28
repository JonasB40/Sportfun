-- ═══════════════════════════════════════════════════════════════
-- DIAGNOSE: waarom kan een account niet inloggen?
--
-- Plak dit in de Supabase SQL-editor:
-- https://supabase.com/dashboard/project/coiocqvopxgvdezuwqou/sql/new
--
-- Vervang het e-mailadres op de regel hieronder als je een ander
-- account wil nakijken. Dit script LEEST alleen — het wijzigt niets.
-- ═══════════════════════════════════════════════════════════════

WITH doel AS (SELECT 'jonasbaes@hotmail.com'::text AS email)

SELECT
  u.email,
  CASE WHEN u.email_confirmed_at IS NULL
       THEN '❌ NIET BEVESTIGD — dit blokkeert inloggen'
       ELSE '✅ bevestigd op ' || u.email_confirmed_at::date
  END                                        AS mailbevestiging,
  CASE WHEN p.id IS NULL
       THEN '❌ GEEN PROFIEL — inloggen lukt, maar de app weigert'
       ELSE '✅ profiel aanwezig (rol: ' || p.rol || ')'
  END                                        AS profiel,
  CASE WHEN p.actief IS FALSE
       THEN '⚠️ gedeactiveerd (blokkeert inloggen niet, maar verbergt wel in lijsten)'
       ELSE '✅ actief'
  END                                        AS status,
  CASE WHEN u.banned_until > now()
       THEN '❌ GEBLOKKEERD tot ' || u.banned_until::text
       ELSE '✅ niet geblokkeerd'
  END                                        AS blokkade,
  u.last_sign_in_at                          AS laatst_ingelogd,
  u.created_at                               AS account_gemaakt
FROM doel d
LEFT JOIN auth.users u   ON lower(u.email) = lower(d.email)
LEFT JOIN public.profielen p ON p.id = u.id;

-- Komt hierboven GEEN enkele rij terug? Dan bestaat er geen account
-- met dit e-mailadres. Controleer op typfouten of een ander adres.


-- ───────────────────────────────────────────────────────────────
-- Dubbele profielen opsporen
--
-- haalProfielOp() gebruikt .single() en faalt als er meer dan één
-- rij terugkomt. Dat geeft de melding "jouw profiel ontbreekt nog",
-- ook al bestaat het profiel wél.
-- ───────────────────────────────────────────────────────────────

SELECT email, count(*) AS aantal, array_agg(id) AS profiel_ids
FROM public.profielen
GROUP BY email
HAVING count(*) > 1;


-- ───────────────────────────────────────────────────────────────
-- Alle accounts met een onbevestigd e-mailadres
--
-- Dit is het probleem dat de Edge Function 'admin-create-user'
-- oplost. Zolang die niet gedeployed is, maakt het beheerderspaneel
-- accounts aan via de gewone signup, en die vereisen bevestiging.
-- ───────────────────────────────────────────────────────────────

SELECT u.email, u.created_at::date AS aangemaakt, p.rol
FROM auth.users u
LEFT JOIN public.profielen p ON p.id = u.id
WHERE u.email_confirmed_at IS NULL
ORDER BY u.created_at DESC;
