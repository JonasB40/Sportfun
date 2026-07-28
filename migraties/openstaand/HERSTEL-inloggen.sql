-- ═══════════════════════════════════════════════════════════════
-- HERSTEL: inloggen weer mogelijk maken
--
-- Voer eerst DIAGNOSE-inloggen.sql uit. Kies daarna hieronder het
-- blok dat bij de gevonden oorzaak past en voer ALLEEN dat blok uit.
--
-- Pas het e-mailadres aan waar nodig.
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- OORZAAK 1: e-mailadres niet bevestigd
--
-- Verreweg de waarschijnlijkste oorzaak. Accounts die via het
-- beheerderspaneel zijn aangemaakt terwijl de Edge Function
-- 'admin-create-user' nog niet gedeployed was, kregen een
-- bevestigingsmail die vaak nooit gelezen of gevonden wordt.
--
-- Dit bevestigt het adres handmatig, zodat inloggen meteen werkt.
-- ───────────────────────────────────────────────────────────────

UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE lower(email) = lower('jonasbaes@hotmail.com')
  AND email_confirmed_at IS NULL;

-- Alle onbevestigde accounts in één keer bevestigen? Vervang de
-- query hierboven door deze — doe dit alleen als je zeker weet dat
-- alle betrokken adressen kloppen:
--
-- UPDATE auth.users
-- SET email_confirmed_at = now()
-- WHERE email_confirmed_at IS NULL;


-- ───────────────────────────────────────────────────────────────
-- OORZAAK 2: profiel ontbreekt
--
-- Het auth-account bestaat, maar er is geen rij in profielen.
-- De app meldt dan: "Inloggen gelukt, maar jouw profiel ontbreekt nog."
--
-- Pas voornaam, achternaam en rol aan voordat je dit uitvoert.
-- Geldige rollen: admin, coordinator, lesgever, extra_hulp
-- ───────────────────────────────────────────────────────────────

-- INSERT INTO public.profielen (id, voornaam, achternaam, email, rol, actief)
-- SELECT u.id, 'Jonas', 'Baes', u.email, 'admin', true
-- FROM auth.users u
-- WHERE lower(u.email) = lower('jonasbaes@hotmail.com')
-- ON CONFLICT (id) DO UPDATE
--   SET rol = EXCLUDED.rol, actief = true;


-- ───────────────────────────────────────────────────────────────
-- OORZAAK 3: profiel gedeactiveerd
--
-- Blokkeert inloggen niet, maar verbergt het account wel in
-- overzichten. Gebeurt onder meer na het samenvoegen van profielen,
-- waarbij het bronprofiel op actief = false wordt gezet.
-- ───────────────────────────────────────────────────────────────

-- UPDATE public.profielen
-- SET actief = true
-- WHERE lower(email) = lower('jonasbaes@hotmail.com');


-- ───────────────────────────────────────────────────────────────
-- CONTROLE: voer dit na het herstel uit
-- ───────────────────────────────────────────────────────────────

SELECT
  u.email,
  u.email_confirmed_at IS NOT NULL AS mail_bevestigd,
  p.rol,
  p.actief
FROM auth.users u
LEFT JOIN public.profielen p ON p.id = u.id
WHERE lower(u.email) = lower('jonasbaes@hotmail.com');
