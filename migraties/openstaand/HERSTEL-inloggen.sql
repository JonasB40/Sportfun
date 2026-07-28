-- ═══════════════════════════════════════════════════════════════
-- HERSTEL: inloggen weer mogelijk maken
--
-- ▸ VASTGESTELD op 2026-07-28 voor jonasbaes@hotmail.com:
--
--   Het account is volledig in orde — e-mail bevestigd, profiel
--   aanwezig met rol admin, actief, niet geblokkeerd, en op
--   2026-07-11 nog succesvol ingelogd.
--
--   Ook getest: de auth-endpoint antwoordt normaal en er is GEEN
--   rate limiting, en de reset-endpoint aanvaardt aanvragen.
--
--   Conclusie: oorzaak 1, 2 en 3 hieronder zijn uitgesloten. Het
--   wachtwoord klopt niet meer, en herstel via e-mail werkt niet
--   omdat die mail Hotmail niet bereikt. Supabase antwoordt daar
--   bewust altijd met "gelukt", ook als er niets verstuurd wordt —
--   daarom lijkt "wachtwoord vergeten" stil te falen.
--
--   ▸ GA DIRECT NAAR OORZAAK 4 ONDERAAN.
--
-- De overige blokken blijven staan voor toekomstige gevallen bij
-- andere gebruikers. Voer altijd eerst DIAGNOSE-inloggen.sql uit.
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
-- ▸ OORZAAK 4: wachtwoord kwijt, en herstel per e-mail werkt niet
--
-- Dit is het vastgestelde geval. Het account werkt, maar het
-- wachtwoord klopt niet meer en de resetmail bereikt Hotmail niet.
--
-- Onderstaande query zet rechtstreeks een nieuw wachtwoord, volledig
-- buiten e-mail om. Vervang 'KiesEenNieuwWachtwoord' door een eigen
-- wachtwoord van minstens 8 tekens. Haal daarna de twee streepjes
-- voor elke regel weg en voer alleen dit blok uit.
--
-- De functies crypt() en gen_salt() staan op Supabase in het schema
-- 'extensions', niet in 'public'. Zonder dat voorvoegsel krijg je
-- "function crypt(...) does not exist". Nagekeken op 2026-07-28.
--
-- gen_salt('bf', 10) gebruikt sterkte 10, dezelfde die Supabase zelf
-- hanteert. Zonder dat tweede argument wordt het 6 — dat werkt ook,
-- maar wijkt af van de rest van je gebruikers.
-- ───────────────────────────────────────────────────────────────

-- VERVANG hieronder JouwNieuwWachtwoord door je eigen wachtwoord
-- (minstens 8 tekens) en haal de twee streepjes voor elke regel weg.

-- UPDATE auth.users
-- SET encrypted_password = extensions.crypt('JouwNieuwWachtwoord', extensions.gen_salt('bf', 10)),
--     updated_at = now()
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
