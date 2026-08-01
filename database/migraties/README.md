# Migraties

## `openstaand/`
Nog niet uitgevoerd op de productiedatabase. Kopieer de inhoud in de
[Supabase SQL-editor](https://supabase.com/dashboard/project/coiocqvopxgvdezuwqou/sql/new)
en klik Run. Verplaats het bestand daarna naar deze map (`migraties/`,
als voltooid) zodat `openstaand/` weer leeg is.

## Deze map (voltooide migraties)
Alle overige `.sql`-bestanden hier zijn al toegepast op de
productiedatabase. Ze staan enkel nog als historische referentie
(bv. om te zien wanneer een kolom of policy is toegevoegd) — voer ze
niet opnieuw uit.

`schema.sql` en `seed.sql` staan één map hoger, in `database/`.

LET OP: `schema.sql` is niet meer volledig. Het beschrijft 10 tabellen,
terwijl de productiedatabase er 17 heeft. De migraties in deze map vullen
dat verschil aan, maar 21 ervan zijn in één keer aan git toegevoegd,
waardoor hun onderlinge volgorde niet te achterhalen is. Een database
vanaf nul opbouwen met deze bestanden is dus niet betrouwbaar; kopieer
in dat geval de structuur van de bestaande database.
