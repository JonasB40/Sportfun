-- ============================================================
-- SportFun — E-mail bevestigen + profielen aanmaken
-- Voer dit uit in de Supabase SQL Editor
-- ============================================================

-- Bevestig e-mail voor chdraps@gmail.com
UPDATE auth.users
SET email_confirmed_at = now(),
    updated_at         = now()
WHERE email = 'chdraps@gmail.com';

-- Profiel aanmaken als admin
INSERT INTO public.profielen (id, voornaam, achternaam, email, rol, actief)
SELECT id, 'Test', 'Account', email, 'admin', true
FROM auth.users
WHERE email = 'chdraps@gmail.com'
ON CONFLICT (id) DO UPDATE
  SET rol = 'admin', actief = true;

-- Bevestig e-mail voor jonasbaes@hotmail.com
UPDATE auth.users
SET email_confirmed_at = now(),
    updated_at         = now()
WHERE email = 'jonasbaes@hotmail.com';

-- Profiel aanmaken als admin
INSERT INTO public.profielen (id, voornaam, achternaam, email, rol, actief)
SELECT id, 'Jonas', 'Baes', email, 'admin', true
FROM auth.users
WHERE email = 'jonasbaes@hotmail.com'
ON CONFLICT (id) DO UPDATE
  SET rol = 'admin', actief = true;

-- Controleer resultaat
SELECT u.email, u.email_confirmed_at, p.rol, p.actief
FROM auth.users u
LEFT JOIN public.profielen p ON p.id = u.id
WHERE u.email IN ('chdraps@gmail.com', 'jonasbaes@hotmail.com');
