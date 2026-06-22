# Deploy admin-reset-password Edge Function

Eenmalig op te zetten zodat de **🔑 Wachtwoord** knop in admin direct werkt.

## Optie A — Via Supabase Dashboard (snelst, geen installatie)

1. Ga naar [Edge Functions](https://supabase.com/dashboard/project/coiocqvopxgvdezuwqou/functions)
2. Klik **"Deploy a new function"** (groene knop)
3. Naam: **`admin-reset-password`** (exact zo)
4. Open het bestand `supabase/functions/admin-reset-password/index.ts` in jouw projectmap
5. Kopieer alle inhoud → plak in de Dashboard-editor (vervang voorbeeldcode)
6. Klik **Deploy function**

✅ Klaar — duurt ±30 seconden.

> Geen extra environment-variabelen instellen: Supabase voorziet automatisch `SUPABASE_URL`, `SUPABASE_ANON_KEY` en `SUPABASE_SERVICE_ROLE_KEY`.

## Optie B — Via Supabase CLI (voor ontwikkelaars)

```bash
# Eenmalig: installeer CLI
npm install -g supabase

# In projectmap:
supabase login
supabase link --project-ref coiocqvopxgvdezuwqou
supabase functions deploy admin-reset-password
```

## Testen

1. Refresh `admin.html` in de browser
2. Ga naar **Beheer → Lesgevers**
3. Klik op het 👁 oog van een lesgever
4. Klik **🔑 Wachtwoord** → kies "Direct nieuw wachtwoord instellen" → vul een wachtwoord in → **Uitvoeren**
5. Je krijgt: *"✓ Wachtwoord ingesteld. Lesgever kan inloggen met: SportFun2026!"*

## Beveiliging

- Edge Function checkt of de aanroeper rol `admin` of `coordinator` heeft
- Service-role-key blijft uitsluitend server-side, niet in browser
- Reset werkt enkel voor bestaande gebruikers in `auth.users`
