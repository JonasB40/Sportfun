# Deploy Edge Functions

Eenmalig op te zetten. Er zijn **twee** functies:

| Functie | Waarvoor |
|---|---|
| `admin-reset-password` | De **🔑 Wachtwoord** knop in admin werkt direct |
| `admin-create-user` | Nieuwe accounts kunnen **direct inloggen** (geen bevestigingsmail nodig) — voorkomt dubbele registraties |

## Optie A — Via Supabase Dashboard (snelst, geen installatie)

Herhaal deze stappen voor beide functies:

1. Ga naar [Edge Functions](https://supabase.com/dashboard/project/coiocqvopxgvdezuwqou/functions)
2. Klik **"Deploy a new function"** (groene knop)
3. Naam: **`admin-reset-password`** resp. **`admin-create-user`** (exact zo)
4. Open het bestand `supabase/functions/admin-reset-password/index.ts` resp. `supabase/functions/admin-create-user/index.ts` in jouw projectmap
5. Kopieer alle inhoud → plak in de Dashboard-editor (vervang voorbeeldcode)
6. Klik **Deploy function**

✅ Klaar — duurt ±30 seconden per functie.

> Geen extra environment-variabelen instellen: Supabase voorziet automatisch `SUPABASE_URL`, `SUPABASE_ANON_KEY` en `SUPABASE_SERVICE_ROLE_KEY`.

## Optie B — Via Supabase CLI (voor ontwikkelaars)

```bash
# Eenmalig: installeer CLI
npm install -g supabase

# In projectmap:
supabase login
supabase link --project-ref coiocqvopxgvdezuwqou
supabase functions deploy admin-reset-password
supabase functions deploy admin-create-user
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
