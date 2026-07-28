# Supabase URL-instellingen

Alle e-mails die Supabase verstuurt — wachtwoordherstel, magic links,
uitnodigingen — sturen de gebruiker terug naar een adres dat **in Supabase
zelf** is ingesteld, niet in de code van dit project. Staat dat verkeerd,
dan komen mensen op een andere site terecht en lijkt het alsof de mail
niet werkt.

## Het probleem dat we hier hadden

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

## Waar je het instelt

Supabase Dashboard → **Authentication** → **URL Configuration**

### Site URL

Het hoofdadres van dit portaal. Dit is waar Supabase standaard naartoe
stuurt. Eén waarde, geen jokertekens.

```
https://sportfun.netlify.app
```

### Redirect URLs

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

## Waarom `/index.html` er apart bij moet

`js/auth.js` vraagt bij een herstelmail expliciet om terug te keren naar
de loginpagina:

```js
redirectTo: window.location.origin + '/index.html'
```

Supabase vergelijkt dat adres letterlijk met de lijst hierboven. Staat
alleen het domein in de lijst en niet het pad, dan wordt het verzoek
genegeerd en beland je alsnog op de Site URL.

## Controleren of het werkt

1. Vraag een wachtwoordherstel aan via de loginpagina.
2. Open de link in de mail.
3. Je hoort op de loginpagina van dit portaal uit te komen, met een lange
   `#access_token=...` achter de URL.

Die fragmentwaarde wordt automatisch opgepikt door `js/supabase.js`, waar
`detectSessionInUrl: true` staat. Kom je ergens anders uit, dan klopt de
Site URL of de Redirect URLs nog niet.

## Als je buitengesloten raakt

Een geldige herstel-URL kun je handmatig omleiden: neem alles vanaf de `#`
en plak het achter het juiste adres.

```
https://sportfun.netlify.app/index.html#access_token=...
```

Het token blijft één uur geldig. Werkt dat niet meer, zet dan een nieuw
wachtwoord via `migraties/openstaand/HERSTEL-inloggen.sql`.

## Verwante instelling: e-mailbezorging

Supabase verstuurt op het gratis plan via een gedeelde afzender met een
lage limiet. Hotmail en Outlook weigeren die vaak. Voor een productiesite
stel je eigen SMTP in onder **Authentication → Emails**, met je eigen
domein als afzender.
