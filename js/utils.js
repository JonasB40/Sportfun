/**
 * utils.js — Gedeelde hulpfuncties
 *
 * Datum-opmaak, toast-meldingen en andere herbruikbare utilities.
 *
 * @module utils
 */

// ── HTML escaping ───────────────────────────────────────────────────

/**
 * Ontsnap een waarde zodat hij veilig in innerHTML gezet kan worden.
 * Gebruik dit ALTIJD als je gebruikersdata in een HTML-string injecteert.
 *
 * @param {any} waarde - Te ontsnappen waarde.
 * @returns {string}
 */
export function ontsnap(waarde) {
  if (waarde == null) return '';
  return String(waarde)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Toast meldingen ─────────────────────────────────────────────────

/**
 * Toon een tijdelijke toast-melding onderaan het scherm.
 *
 * @param {string} bericht - De te tonen boodschap.
 * @param {'succes'|'fout'|'info'} type - Het type melding (bepaalt kleur).
 * @param {number} [duur=3500] - Hoe lang de toast zichtbaar blijft (ms).
 */
export function toonToast(bericht, type = 'info', duur = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = bericht;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duur);
}

// ── Datum hulpfuncties ──────────────────────────────────────────────

/**
 * Formatteer een ISO datumstring naar dd/mm/jjjj.
 *
 * @param {string} iso - ISO 8601 datumstring.
 * @returns {string} Geformatteerde datum, bv. "15/07/2025".
 */
export function formateerDatum(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Formatteer een ISO datumstring naar Nederlandstalig formaat.
 *
 * @param {string} iso - ISO 8601 datumstring.
 * @param {boolean} [kortForm=false] - Als true, enkel dag + maand.
 * @returns {string} Bv. "15 juli 2025" of "15 juli".
 */
export function datumNaarNL(iso, kortForm = false) {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  const opties = kortForm
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'long', year: 'numeric' };
  return d.toLocaleDateString('nl-BE', opties);
}

/**
 * Geef de Nederlandstalige dagnaam voor een datum.
 *
 * @param {string} iso - ISO datumstring (jjjj-mm-dd).
 * @returns {string} Bv. "Maandag".
 */
export function dagNaam(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('nl-BE', { weekday: 'long' })
    .charAt(0).toUpperCase() + d.toLocaleDateString('nl-BE', { weekday: 'long' }).slice(1);
}

/**
 * Controleer of een datum vandaag is.
 *
 * @param {string} iso - ISO datumstring.
 * @returns {boolean}
 */
export function isVandaag(iso) {
  return iso === lokaleISO(new Date());
}

/**
 * Geef de lokale (niet-UTC!) datum als ISO-string "JJJJ-MM-DD".
 * KRITIEK: gebruik dit altijd ipv toISOString() bij dag-berekeningen,
 * anders schuift de datum een dag terug door tijdzonecorrectie.
 *
 * @param {Date} d - Een Date-object.
 * @returns {string} "JJJJ-MM-DD" in lokale tijd.
 */
export function lokaleISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Genereer een array van datumstrings tussen twee data.
 *
 * @param {string} start - ISO startdatum.
 * @param {string} eind - ISO einddatum.
 * @returns {string[]}
 */
export function genereerDatumReeks(start, eind) {
  const reeks = [];
  const huidig = new Date(start + 'T00:00:00');
  const eindDatum = new Date(eind + 'T00:00:00');
  while (huidig <= eindDatum) {
    reeks.push(lokaleISO(huidig));
    huidig.setDate(huidig.getDate() + 1);
  }
  return reeks;
}

// ── Token generatie ─────────────────────────────────────────────────

/**
 * Genereer een willekeurig uitnodigingstoken (URL-veilig).
 *
 * @param {number} [lengte=32] - Lengte van het token.
 * @returns {string} Willekeurig token.
 */
export function genereerToken(lengte = 32) {
  const tekens = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  const array = new Uint8Array(lengte);
  crypto.getRandomValues(array);
  array.forEach(byte => { token += tekens[byte % tekens.length]; });
  return token;
}

// ── DOM hulpfuncties ────────────────────────────────────────────────

/**
 * Toon een laad-overlay op de pagina.
 *
 * @param {boolean} toon - Of de overlay getoond of verborgen moet worden.
 */
export function toonLaadOverlay(toon) {
  let overlay = document.getElementById('laad-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'laad-overlay';
    overlay.className = 'laad-overlay';
    overlay.innerHTML = '<div class="laadindicator"></div><div style="font-size:0.88rem;color:#6B7280">Laden…</div>';
    document.body.appendChild(overlay);
  }
  overlay.style.display = toon ? 'flex' : 'none';
}

/**
 * Maak een bevestigingsdialoog en geef het antwoord terug.
 * Gebruik dit in plaats van window.confirm() voor een betere UX.
 *
 * @param {string} vraag - De bevestigingsvraag.
 * @returns {Promise<boolean>} True als de gebruiker bevestigt.
 */
export function bevestig(vraag) {
  return new Promise(resolve => {
    const bestaand = document.getElementById('bevestig-modal');
    if (bestaand) bestaand.remove();

    const modal = document.createElement('div');
    modal.id = 'bevestig-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal modal-sm">
        <div class="modal-lichaam" style="padding:28px 24px">
          <p id="bevestig-tekst" style="font-size:0.95rem;line-height:1.6"></p>
          <div class="flex-gap mt-16" style="justify-content:flex-end">
            <button class="knop knop-omtrek" id="bevestig-nee">Annuleren</button>
            <button class="knop knop-gevaar" id="bevestig-ja">Bevestigen</button>
          </div>
        </div>
      </div>
    `;
    modal.querySelector('#bevestig-tekst').textContent = vraag;
    document.body.appendChild(modal);

    document.getElementById('bevestig-ja').addEventListener('click', () => { modal.remove(); resolve(true); });
    document.getElementById('bevestig-nee').addEventListener('click', () => { modal.remove(); resolve(false); });
    modal.addEventListener('click', (e) => { if (e.target === modal) { modal.remove(); resolve(false); } });
  });
}

/**
 * Open een modal door de overlay zichtbaar te maken.
 *
 * @param {string} modalId - ID van de modal-overlay.
 */
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('verborgen');
}

/**
 * Sluit een modal door de overlay te verbergen.
 *
 * @param {string} modalId - ID van de modal-overlay.
 */
export function sluitModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('verborgen');
}

/**
 * Initialiseer sluitknoppen voor alle modals op de pagina.
 * Voegt click-listeners toe aan .modal-sluiten en klik buiten modal.
 */
export function initialiseerModals() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('verborgen');
    });
    overlay.querySelectorAll('.modal-sluiten').forEach(knop => {
      knop.addEventListener('click', () => overlay.classList.add('verborgen'));
    });
  });
}

/**
 * Initialiseer de hamburger navigatie voor mobiel.
 */
export function initialiseerHamburger() {
  const hamburger = document.getElementById('hamburger');
  const zijbalk   = document.querySelector('.zijbalk');
  const overlay   = document.querySelector('.overlay-nav');

  if (!hamburger || !zijbalk) return;

  const sluitZijbalk = () => {
    zijbalk.classList.remove('open');
    overlay?.classList.remove('zichtbaar');
  };

  hamburger.addEventListener('click', () => {
    zijbalk.classList.toggle('open');
    overlay?.classList.toggle('zichtbaar');
  });

  overlay?.addEventListener('click', sluitZijbalk);

  // Sluit zijbalk automatisch bij klik op nav-link (mobiel UX)
  zijbalk.querySelectorAll('.zijbalk-nav a').forEach(link => {
    link.addEventListener('click', sluitZijbalk);
  });
}

/**
 * Activeer het juiste navigatie-tabblad op basis van de huidige pagina.
 *
 * @param {string} huidigePagina - Bestandsnaam van de huidige pagina, bv. "planner.html".
 */
export function markeerActiefNavItem(huidigePagina) {
  document.querySelectorAll('.zijbalk-nav a').forEach(link => {
    const href = link.getAttribute('href');
    link.classList.toggle('actief', href === huidigePagina);
  });
}

/**
 * Kopieer tekst naar het klembord en toon een bevestiging.
 *
 * @param {string} tekst - De te kopiëren tekst.
 */
export async function kopieerNaarKlembord(tekst) {
  try {
    await navigator.clipboard.writeText(tekst);
    toonToast('Gekopieerd naar klembord.', 'succes');
  } catch {
    toonToast('Kon niet kopiëren. Kopieer handmatig.', 'fout');
  }
}

// ── iCal / Agenda export ────────────────────────────────────────────

/**
 * Genereer een .ics bestandsinhoud voor een lijst van kampen.
 * Elk kamp wordt een "all-day" event in de agenda.
 *
 * @param {object[]} kampen - Array van kamp-objecten met naam, locatie, startdatum, einddatum.
 * @param {string} [kalenderNaam='SportFun Kampen']
 * @returns {string} iCal-bestandsinhoud als tekst.
 */
export function genereerICalBestand(kampen, kalenderNaam = 'SportFun Kampen') {
  const lijnen = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SportFun Portaal//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icalEscape(kalenderNaam)}`,
    'X-WR-TIMEZONE:Europe/Brussels',
  ];

  for (const kamp of kampen) {
    // DTEND voor all-day events = dag NA de laatste dag (iCal-conventie)
    const eindPlusEen = new Date(kamp.einddatum + 'T00:00:00');
    eindPlusEen.setDate(eindPlusEen.getDate() + 1);
    const start = kamp.startdatum.replace(/-/g, '');
    const eind  = lokaleISO(eindPlusEen).replace(/-/g, '');
    const nu    = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

    lijnen.push(
      'BEGIN:VEVENT',
      `UID:${kamp.id}@sportfun-portaal`,
      `DTSTAMP:${nu}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${eind}`,
      `SUMMARY:${icalEscape(kamp.naam)}`,
      `LOCATION:${icalEscape(kamp.locatie ?? '')}`,
      `DESCRIPTION:${icalEscape(kamp.leeftijdsgroep ?? '')}`,
      'END:VEVENT',
    );
  }

  lijnen.push('END:VCALENDAR');
  return lijnen.join('\r\n');
}

/**
 * Start een bestandsdownload in de browser.
 *
 * @param {string} inhoud - De bestandsinhoud als tekst.
 * @param {string} bestandsnaam - Naam van het te downloaden bestand.
 * @param {string} [type='text/plain'] - MIME-type.
 */
export function downloadBestand(inhoud, bestandsnaam, type = 'text/plain') {
  const blob = new Blob([inhoud], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = bestandsnaam;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Ontsnap speciale tekens voor iCal-veldwaarden. */
function icalEscape(tekst) {
  return String(tekst ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}
