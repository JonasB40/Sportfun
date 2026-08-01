# SportFun Lesgeversportaal

Een volledig functioneel webportaal voor het beheer van sportkampen, lesgevers, activiteitenfiches en vrijwilligerscontracten.

---

## Vereisten

- Een gratis [Supabase](https://supabase.com) account
- Een webbrowser (Chrome, Firefox, Edge, Safari)
- Geen server of buildtool nodig — puur statische bestanden

---

## Stap 1: Supabase project aanmaken

1. Ga naar [supabase.com](https://supabase.com) en log in.
2. Klik op **New project**.
3. Kies een naam (bv. `sportfun-portaal`) en een sterk databasewachtwoord.
4. Kies een regio dicht bij België (bv. **West Europe**).
5. Wacht tot het project klaar is (±1 minuut).

---

## Stap 2: Database aanmaken

> **Let op:** `database/schema.sql` is niet meer volledig — het beschrijft
> 10 tabellen terwijl de productiedatabase er 17 heeft. Zie de
> waarschuwing bovenaan dat bestand. Zet je een tweede omgeving op,
> kopieer dan de structuur van de bestaande database.

1. Ga in het Supabase dashboard naar **SQL Editor**.
2. Klik op **New query**.
3. Kopieer de volledige inhoud van `database/schema.sql` en plak deze in het editor.
4. Klik op **Run** (of druk op `Ctrl+Enter`).
5. Controleer dat er geen fouten zijn in de output onderaan.

Dit maakt alle tabellen, indexen, RLS-policies en de registratietrigger aan.

---

## Stap 3: Supabase-sleutels ophalen en invullen

1. Ga in het dashboard naar **Project Settings > API**.
2. Kopieer:
   - **Project URL** (bv. `https://abcdefgh.supabase.co`)
   - **anon public** sleutel (lange string onder "Project API keys")
3. Open het bestand `public/js/supabase.js` in een teksteditor.
4. Vervang de placeholders:

```javascript
const SUPABASE_URL = 'https://JOUW-PROJECT-ID.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciO...';
```

---

## Stap 4: Eerste admin-account aanmaken

De eerste beheerder moet handmatig aangemaakt worden via het Supabase dashboard, omdat zelfregistratie uitgeschakeld is.

1. Ga naar **Authentication > Users > Add user**.
2. Vul het e-mailadres en wachtwoord in voor de eerste beheerder.
3. Klik op **Create user** en kopieer de gegenereerde **UUID**.
4. Ga naar **Table Editor > profielen**.
5. Voeg een rij toe met:
   - `id`: de gekopieerde UUID
   - `voornaam`: jouw voornaam
   - `achternaam`: jouw achternaam
   - `email`: jouw e-mailadres
   - `rol`: `admin`
   - `actief`: `true`

Je kunt nu inloggen via `index.html` en andere teamleden uitnodigen via de beheerpagina.

---

## Stap 5: Demo-data laden (optioneel)

> ⚠️ Alleen aanbevolen voor een testomgeving, niet voor productie.

De demo-data in `database/seed.sql` gebruikt vaste UUID's die **niet overeenkomen** met echte auth-gebruikers. Voor een werkende demo:

1. Maak de testgebruikers handmatig aan via **Authentication > Users**.
2. Kopieer de echte UUID's.
3. Vervang de UUID's bovenaan `database/seed.sql` door de echte waarden.
4. Voer `database/seed.sql` uit via de **SQL Editor**.

---

## Bestandsstructuur

De map is in tweeën gedeeld: **`public/` is de website**, al de rest is
bronmateriaal dat nooit online hoort.

```
sportfun-portaal/
│
├── public/                  ← DIT is de website (zie "Online zetten")
│   ├── index.html           # Loginpagina
│   ├── dashboard.html       # Startpagina na het inloggen
│   ├── planner.html         # Kampplanning en dagprogramma's
│   ├── profiel.html         # Profiel, contracten en uitbetalingen
│   ├── fiches.html          # Activiteitenfiche-bibliotheek
│   ├── materiaal.html       # Materiaallijsten per kamp
│   ├── beschikbaarheid.html # Beschikbaarheid opgeven
│   ├── admin.html           # Beheerpagina (admin + coördinator)
│   ├── registreer.html      # Registratie via uitnodigingslink
│   ├── 404.html             # Foutpagina
│   ├── img/                 # Alle afbeeldingen
│   │   ├── logo-kleur.svg   # Groen logo — favicon + lichte achtergrond
│   │   └── logo-wit.svg     # Wit logo — donkere paginakop
│   ├── css/
│   │   ├── style.css        # Gedeelde stijlen
│   │   ├── components.css   # Herbruikbare UI-componenten
│   │   ├── kampfilter.css   # Filterbalk voor kampen
│   │   └── lesgeverfiches.css
│   └── js/
│       ├── supabase.js      # Supabase client (vul URL + key in)
│       ├── auth.js          # Login, logout, sessiebeheer
│       ├── dashboard.js     # Startpagina
│       ├── planner.js       # Plannerlogica
│       ├── kampfilter.js    # Filteren en archiveren van kampen
│       ├── fiches.js        # Fichebeheer
│       ├── materiaal.js     # Materiaalbeheer
│       ├── contracten.js    # Contractgeneratie en ondertekening
│       ├── financieel.js    # Vergoedingen en uitbetalingen
│       ├── admin.js         # Beheerfuncties
│       └── utils.js         # Gedeelde hulpfuncties
│
├── database/                ← blijft offline
│   ├── schema.sql           # Oorspronkelijk schema (ZIE WAARSCHUWING BOVENAAN)
│   ├── seed.sql             # Demo-data
│   └── migraties/           # Toegepaste wijzigingen; openstaand/ = nog uit te voeren
├── docs/SUPABASE.md         # Instellingen in het Supabase-dashboard
├── supabase/functions/      # Edge Functions (draaien bij Supabase, niet hier)
├── tools/                   # Lokale server + versie-bump
├── netlify.toml             # Hostingconfiguratie
└── README.md                # Dit bestand
```

---

## Online zetten

### Welke bestanden moeten geüpload worden?

**Alleen de inhoud van `public/`.** Sleep de bestanden *binnenin* die map
naar de webroot van je hosting (bij de meeste hosts heet die `public_html`,
`www` of `httpdocs`) — dus niet de map `public` zelf, anders komt de site
op `jouwdomein.be/public/` te staan.

Wat er dus in de file manager terechtkomt:

| Uploaden | Wat |
|---|---|
| ✅ | de 10 `.html`-bestanden uit `public/` |
| ✅ | de map `public/css/` |
| ✅ | de map `public/js/` |
| ✅ | de map `public/img/` |

En wat je **niet** uploadt — dit hoort niet op een openbare server:

| Niet uploaden | Waarom |
|---|---|
| ❌ `database/` | Bevat je volledige databasestructuur. Deze SQL hoort in de Supabase SQL-editor, niet op het web. |
| ❌ `docs/` | Interne handleiding. |
| ❌ `tools/` | Python-scripts voor lokaal gebruik. |
| ❌ `supabase/` | Edge Functions; die draaien bij Supabase zelf. |
| ❌ `README.md`, `netlify.toml`, `.github/` | Ontwikkelbestanden. |

> Vóór deze indeling stond `database/schema.sql` gewoon publiek op de site
> op te vragen. Door alles wat online moet in `public/` te zetten, kan dat
> niet meer per ongeluk gebeuren.

### Via Netlify

Bij Netlify hoef je niets handmatig te uploaden: `netlify.toml` staat op
`publish = "public"`, dus na een `git push` publiceert Netlify vanzelf
alleen die map.

### Na elke wijziging in `public/js/`

Draai eerst:

```bash
python tools/versie-bump.py
```

Anders blijven browsers de oude JavaScript gebruiken.

---

## Rollen en rechten

| Rol | Toegang |
|---|---|
| **Admin** | Alles: gebruikers, kampen, fiches, contracten, dagprogramma's |
| **Coördinator** | Kampen beheren, lesgevers koppelen, fiches goedkeuren, dagprogramma's |
| **Lesgever** | Eigen planning, beschikbaarheid, profiel, contracten, fiches |
| **Extra hulp** | Zelfde als lesgever, maar met label "Extra hulp" |

---

## Teamleden uitnodigen

Zelfregistratie is bewust uitgeschakeld. Om een nieuw teamlid toe te voegen:

1. Log in als admin of coördinator.
2. Ga naar **Beheer > Lesgevers**.
3. Klik op **Uitnodiging versturen**.
4. Vul het e-mailadres en rol in.
5. Kopieer de gegenereerde uitnodigingslink en stuur die door.
6. De link is 7 dagen geldig.

---

## GDPR-richtlijnen voor de beheerder

### Welke gegevens worden opgeslagen?

- Naam, e-mailadres, telefoonnummer, adres, geboortedatum van vrijwilligers
- Tijdstempel bij ondertekening van contracten
- Beschikbaarheidsinformatie per kamp

### Bewaartermijn

- Persoonsgegevens van vrijwilligers: bewaar maximaal 1 jaar na het laatste kamp waaraan ze deelnamen.
- Verwijder inactieve accounts via **Beheer > Lesgevers > Deactiveren**.
- Voor definitieve verwijdering: gebruik **Authentication > Users > Delete** in het Supabase dashboard.

### Gegevensdeling

- Gegevens worden **niet** gedeeld met derden.
- Supabase verwerkt data op servers in de EU (afhankelijk van gekozen regio).
- Supabase is AVG/GDPR-conform: zie [supabase.com/privacy](https://supabase.com/privacy).

### Rechten van de betrokkene

Vrijwilligers kunnen hun eigen gegevens inzien en bewerken via de profielpagina.
Voor volledige verwijdering van gegevens: neem contact op met de beheerder.

### Aanbevolen acties

- Gebruik een sterk databasewachtwoord (min. 20 tekens).
- Schakel **Two-Factor Authentication** in op het Supabase-account.
- Beperk toegang tot het Supabase-dashboard tot vertrouwde beheerders.
- Exporteer geen persoonsgegevens naar onbeveiligde bestanden of e-mails.

---

## Veelgestelde vragen

**Ik zie "JOUW_SUPABASE_URL" in de console — wat doe ik?**
Vul de Supabase URL en anon key in `public/js/supabase.js` in (zie Stap 3).

**Mijn login werkt niet.**
Controleer of het profiel correct is aangemaakt in de `profielen`-tabel met het juiste UUID.

**De pagina laadt maar toont geen data.**
Open de browser-console (F12) en controleer op RLS-fouten. Zorg dat de `eigen_rol()`-functie correct aangemaakt is via `database/schema.sql`.

**Kan ik het portaal hosten?**
Ja — upload de inhoud van `public/` naar een statische hosting dienst zoals Netlify, Vercel of GitHub Pages (zie "Online zetten" hierboven). De `public/js/supabase.js` bevat de publieke anon-sleutel, die veilig is voor client-side gebruik mits RLS correct geconfigureerd is.

**Waarom staat een afgelopen kamp nog in de lijst?**
Dat hoort niet meer te gebeuren: kampen waarvan de einddatum voorbij is,
verhuizen automatisch naar de ingeklapte sectie **📦 Archief** onderaan de
kampenlijst. Klap die open, of zet in de filterbalk de schakelaar
**Archief** aan, om ze terug te zien.
