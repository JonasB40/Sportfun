-- ============================================================
-- SportFun — E-mail bevestigen + profielen aanmaken
-- Voer dit uit in de Supabase SQL Editor
-- ============================================================
-- Vervang 'jouw-email@voorbeeld.be' hieronder door het echte
-- e-mailadres van de gebruiker die je admin wil maken. De gebruiker
-- moet eerst geregistreerd zijn (bestaat in auth.users).
-- ============================================================

-- Bevestig e-mail voor de gebruiker
UPDATE auth.users
SET email_confirmed_at = now(),
    updated_at         = now()
WHERE email = 'jouw-email@voorbeeld.be';

-- Profiel aanmaken als admin
INSERT INTO public.profielen (id, voornaam, achternaam, email, rol, actief)
SELECT id, 'Voornaam', 'Achternaam', email, 'admin', true
FROM auth.users
WHERE email = 'jouw-email@voorbeeld.be'
ON CONFLICT (id) DO UPDATE
  SET rol = 'admin', actief = true;

-- Controleer resultaat
SELECT u.email, u.email_confirmed_at, p.rol, p.actief
FROM auth.users u
LEFT JOIN public.profielen p ON p.id = u.id
WHERE u.email = 'jouw-email@voorbeeld.be';
