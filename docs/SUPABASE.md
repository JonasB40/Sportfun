# Supabase-configuratie

Alles wat in het Supabase-dashboard ingesteld moet worden, staat hier
bij elkaar. De code in dit project regelt het niet — dit zijn
instellingen die naast de code leven en die je makkelijk vergeet.

Inhoud:
1. [URL-instellingen](#1-url-instellingen) — waar herstelmails naartoe sturen
2. [Edge Functions](#2-edge-functions) — accounts aanmaken en wachtwoorden resetten
3. [E-mailbezorging](#3-e-mailbezorging)

---

## 1. URL-instellingen

Alle e-mails die Supabase verstuurt — wachtwoordherstel, magic links,
uitnodigingen — sturen de gebruiker terug naar een adres dat **in Supabase
zelf** is ingesteld, niet in de code van dit project. Staat dat verkeerd,
dan komen mensen op een andere site terecht en lijkt het alsof de mail
niet werkt.

### Het probleem dat we hier hadden

Op 2026-07-28 kwam een wachtwoordherstel uit op:

```
http://localhost:3000/#access_token=...&type=magiclink
```

`localhost:3000` was een overblijfsel van een ander project op hetzelfde
Supabase-account. De mail werd correct verstuurd en het token was geldig —
het werd alleen afgeleverd bij een site die er niets mee doet.

Dit is lastig te herkennen, omdat Supabase op een herstelaanvraag **altijd**
met "gelukt" antwoordt, ook wanneer er niets aankomt. Dat is bewust zo
gebouwd zodat niemand kan achterhalen welke adressen bestaan. Het gevolg is
dat een verkeerde URL zich gedraagt als een mail die nooit verstuurd is.

### Waar je het instelt

Supabase Dashboard → **Authentication** → **URL Configuration**

#### Site URL

Het hoofdadres van dit portaal. Dit is waar Supabase standaard naartoe
stuurt. Eén waarde, geen jokertekens.

```
https://sportfun.netlify.app
```

#### Redirect URLs

De volledige lijst van adressen waar Supabase naartoe *mag* sturen. Staat
een adres hier niet bij, dan valt Supabase stilzwijgend terug op de Site
URL. Voeg deze allemaal toe:

```
https://sportfun.netlify.app/**
http://localhost:8181/**
```

Dit is wat er op 2026-07-28 daadwerkelijk is ingesteld. De `/**` dekt
alle paden, dus ook `/index.html` en elke pagina die er later bijkomt.

De `localhost:8181`-regel is voor de lokale ontwikkelserver
(`tools/server.py`). Zonder die regel werkt wachtwoordherstel niet
tijdens het testen op je eigen computer.

### Waarom `/index.html` er apart bij moet

`public/js/auth.js` vraagt bij een herstelmail expliciet om terug te keren naar
de loginpagina:

```js
redirectTo: window.location.origin + '/index.html'
```

Supabase vergelijkt dat adres letterlijk met de lijst hierboven. Staat
alleen het domein in de lijst en niet het pad, dan wordt het verzoek
genegeerd en beland je alsnog op de Site URL.

### Controleren of het werkt

1. Vraag een wachtwoordherstel aan via de loginpagina.
2. Open de link in de mail.
3. Je hoort op de loginpagina van dit portaal uit te komen, met een lange
   `#access_token=...` achter de URL.

Die fragmentwaarde wordt automatisch opgepikt door `public/js/supabase.js`, waar
`detectSessionInUrl: true` staat. Kom je ergens anders uit, dan klopt de
Site URL of de Redirect URLs nog niet.

### Als je buitengesloten raakt

Een geldige herstel-URL kun je handmatig omleiden: neem alles vanaf de `#`
en plak het achter het juiste adres.

```
https://sportfun.netlify.app/index.html#access_token=...
```

Het token blijft één uur geldig. Werkt dat niet meer, gebruik dan de
knop **🔑 Wachtwoord** in het beheerderspaneel, of zet het wachtwoord
rechtstreeks in de SQL-editor:

```sql
UPDATE auth.users
SET encrypted_password = extensions.crypt('NieuwWachtwoord', extensions.gen_salt('bf', 10)),
    updated_at = now()
WHERE lower(email) = lower('iemand@voorbeeld.be');
```

De functies staan bij Supabase in het schema `extensions`, niet in
`public` — zonder dat voorvoegsel krijg je "function crypt(...) does not
exist".

---

## 2. Edge Functions

Eenmalig op te zetten. Er zijn **twee** functies:

| Functie | Waarvoor |
|---|---|
| `admin-reset-password` | De **🔑 Wachtwoord** knop in admin werkt direct |
| `admin-create-user` | Nieuwe accounts kunnen **direct inloggen** (geen bevestigingsmail nodig) — voorkomt dubbele registraties |

### Optie A — Via Supabase Dashboard (snelst, geen installatie)

Herhaal deze stappen voor beide functies:

1. Ga naar [Edge Functions](https://supabase.com/dashboard/project/coiocqvopxgvdezuwqou/functions)
2. Klik **"Deploy a new function"** (groene knop)
3. Naam: **`admin-reset-password`** resp. **`admin-create-user`** (exact zo)
4. Open het bestand `supabase/functions/admin-reset-password/index.ts` resp. `supabase/functions/admin-create-user/index.ts` in jouw projectmap
5. Kopieer alle inhoud → plak in de Dashboard-editor (vervang voorbeeldcode)
6. Klik **Deploy function**

✅ Klaar — duurt ±30 seconden per functie.

> Geen extra environment-variabelen instellen: Supabase voorziet automatisch `SUPABASE_URL`, `SUPABASE_ANON_KEY` en `SUPABASE_SERVICE_ROLE_KEY`.

### Optie B — Via Supabase CLI (voor ontwikkelaars)

```bash
# Eenmalig: installeer CLI
npm install -g supabase

# In projectmap:
supabase login
supabase link --project-ref coiocqvopxgvdezuwqou
supabase functions deploy admin-reset-password
supabase functions deploy admin-create-user
```

### Testen

1. Refresh `admin.html` in de browser
2. Ga naar **Beheer → Lesgevers**
3. Klik op het 👁 oog van een lesgever
4. Klik **🔑 Wachtwoord** → kies "Direct nieuw wachtwoord instellen" → vul een wachtwoord in → **Uitvoeren**
5. Je krijgt: *"✓ Wachtwoord ingesteld. Lesgever kan inloggen met: SportFun2026!"*

### Beveiliging

- Edge Function checkt of de aanroeper rol `admin` of `coordinator` heeft
- Service-role-key blijft uitsluitend server-side, niet in browser
- Reset werkt enkel voor bestaande gebruikers in `auth.users`

---

## 3. E-mailbezorging

Supabase verstuurt op het gratis plan via een gedeelde afzender met een
lage limiet. Hotmail en Outlook weigeren die vaak. Voor een productiesite
stel je eigen SMTP in onder **Authentication → Emails**, met je eigen
domein als afzender.
