/**
 * fiches.js — Activiteitenfiche-bibliotheek
 *
 * Laadt, filtert en toont activiteitenfiches. Beheert het voorstellen
 * van nieuwe fiches en het goedkeuren/afwijzen door coördinatoren.
 *
 * @module fiches
 */

import { supabase } from './supabase.js?v=1780304789425';
import { toonToast, ontsnap } from './utils.js?v=1780304789425';

// ── Fiches ophalen ──────────────────────────────────────────────────

/**
 * Haal activiteitenfiches op uit de database.
 *
 * @param {boolean} alleStatussen - Als true, ook voorstellen en afgekeurde (voor admins).
 * @returns {Promise<object[]>} Lijst van fiche-objecten.
 */
export async function haalFichesOp(alleStatussen = false, eigenGebruikerId = null) {
  try {
    let query = supabase
      .from('activiteiten_fiches')
      .select(`
        *,
        aangemaakt_door_profiel:profielen!aangemaakt_door (voornaam, achternaam)
      `)
      .order('naam');

    if (alleStatussen) {
      // admin/coordinator: alle statussen
    } else if (eigenGebruikerId) {
      // lesgever: goedgekeurde fiches + eigen voorstellen/afgekeurde
      query = query.or(`status.eq.goedgekeurd,aangemaakt_door.eq.${eigenGebruikerId}`);
    } else {
      query = query.eq('status', 'goedgekeurd');
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  } catch (fout) {
    console.error('[fiches] Fout bij ophalen fiches:', fout.message);
    toonToast('Kon fiches niet laden.', 'fout');
    return [];
  }
}

/**
 * Haal één fiche op via ID.
 *
 * @param {string} ficheID - UUID van de fiche.
 * @returns {Promise<object|null>} Het fiche-object of null.
 */
export async function haalFicheOp(ficheID) {
  try {
    const { data, error } = await supabase
      .from('activiteiten_fiches')
      .select(`
        *,
        aangemaakt_door_profiel:profielen!aangemaakt_door (voornaam, achternaam)
      `)
      .eq('id', ficheID)
      .single();
    if (error) throw error;
    return data;
  } catch (fout) {
    console.error('[fiches] Fout bij ophalen fiche:', fout.message);
    return null;
  }
}

// ── Fiche opslaan ───────────────────────────────────────────────────

/**
 * Sla een nieuwe activiteitenfiche op als voorstel.
 *
 * @param {object} ficheData - Alle velden van de fiche.
 * @param {string} gebruikerId - UUID van de aanmaker.
 * @returns {Promise<boolean>} True bij succes.
 */
export async function slaFicheVoorstelOp(ficheData, gebruikerId, isBeheerder = false) {
  const status = isBeheerder ? 'goedgekeurd' : 'voorstel';
  try {
    const { error } = await supabase.from('activiteiten_fiches').insert({
      ...ficheData,
      aangemaakt_door: gebruikerId,
      status,
    });
    if (error) throw error;
    toonToast(isBeheerder ? 'Fiche toegevoegd en goedgekeurd.' : 'Fiche ingediend ter goedkeuring.', 'succes');
    return true;
  } catch (fout) {
    console.error('[fiches] Fout bij opslaan fiche voorstel:', fout.message);
    toonToast('Kon fiche niet opslaan: ' + fout.message, 'fout');
    return false;
  }
}

/**
 * Werk de inhoud van een bestaande fiche bij (enkel voor admins/coördinatoren).
 *
 * @param {string} ficheID - UUID van de fiche.
 * @param {object} ficheData - Bijgewerkte velden.
 * @returns {Promise<boolean>} True bij succes.
 */
export async function werkFicheBij(ficheID, ficheData) {
  try {
    const { error } = await supabase
      .from('activiteiten_fiches')
      .update(ficheData)
      .eq('id', ficheID);
    if (error) throw error;
    toonToast('Fiche opgeslagen.', 'succes');
    return true;
  } catch (fout) {
    console.error('[fiches] Fout bij bijwerken fiche:', fout.message);
    toonToast('Kon fiche niet opslaan: ' + fout.message, 'fout');
    return false;
  }
}

/**
 * Verwijder een activiteitenfiche permanent (enkel voor admins/coördinatoren).
 *
 * @param {string} ficheID - UUID van de fiche.
 * @returns {Promise<boolean>} True bij succes.
 */
export async function verwijderFiche(ficheID) {
  try {
    const { error } = await supabase
      .from('activiteiten_fiches')
      .delete()
      .eq('id', ficheID);
    if (error) throw error;
    toonToast('Fiche verwijderd.', 'succes');
    return true;
  } catch (fout) {
    console.error('[fiches] Fout bij verwijderen fiche:', fout.message);
    toonToast('Kon fiche niet verwijderen: ' + fout.message, 'fout');
    return false;
  }
}

/**
 * Vul het fiche-formulier in met bestaande fichedata.
 * @param {object} fiche
 */
export function vulFormulierMetFiche(fiche) {
  const stel = (id, waarde) => {
    const el = document.getElementById(id);
    if (el) el.value = waarde ?? '';
  };
  stel('fiche-naam',         fiche.naam ?? '');
  stel('fiche-thema',        fiche.thema ?? '');
  stel('fiche-categorie',    fiche.categorie ?? '');
  stel('fiche-leeftijd',     fiche.leeftijdsgroep ?? '');
  stel('fiche-locatie',      fiche.locatie ?? 'beide');
  stel('fiche-moeilijkheid', fiche.moeilijkheid ?? 'gemiddeld');
  stel('fiche-duur',         fiche.duur_minuten ?? '');
  stel('fiche-min',          fiche.min_deelnemers ?? '');
  stel('fiche-max',          fiche.max_deelnemers ?? '');
  stel('fiche-doelstelling', fiche.doelstelling ?? '');
  stel('fiche-spelregels',   fiche.spelregels ?? '');
  stel('fiche-variaties',    fiche.variaties ?? '');
  laadMateriaalTags(fiche.materiaal);
  stel('fiche-winnaar',      fiche.winnaar ?? '');
}

// ── Tag-invoer voor materiaal ────────────────────────────────────────

function _maakTagEl(tekst) {
  const el   = document.createElement('span');
  el.className      = 'tag-item';
  el.dataset.waarde = tekst;
  const naam = document.createElement('span');
  naam.textContent  = tekst;
  const knop = document.createElement('button');
  knop.type         = 'button';
  knop.className    = 'tag-x';
  knop.setAttribute('aria-label', `Verwijder ${tekst}`);
  knop.textContent  = '×';
  knop.addEventListener('click', (e) => { e.stopPropagation(); el.remove(); });
  el.append(naam, knop);
  return el;
}

/** Initialiseer de tag-invoer in het fiche-formulier. Aanroepen na het injecteren van de form-HTML. */
export function initialiseerTagInvoer() {
  const container = document.getElementById('tag-invoer-container');
  if (!container) return;
  const input = container.querySelector('.tag-invoer-input');
  if (!input) return;

  function voegTagToe(tekst) {
    tekst = tekst.trim().replace(/,+$/, '');
    if (!tekst) return;
    container.insertBefore(_maakTagEl(tekst), input);
    input.value = '';
    input.focus();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      voegTagToe(input.value);
    } else if (e.key === ',') {
      e.preventDefault();
      voegTagToe(input.value);
    } else if (e.key === 'Backspace' && !input.value) {
      const tags = container.querySelectorAll('.tag-item');
      tags[tags.length - 1]?.remove();
    }
  });

  input.addEventListener('blur', () => { if (input.value.trim()) voegTagToe(input.value); });
  container.addEventListener('click', () => input.focus());

  // Wis tags wanneer het formulier gereset wordt
  document.getElementById('fiche-formulier')?.addEventListener('reset', () => {
    container.querySelectorAll('.tag-item').forEach(t => t.remove());
    input.value = '';
  }, { once: false });
}

/** Laad een array van materiaalstrings als tags in de tag-invoer. */
export function laadMateriaalTags(materiaalArray) {
  const container = document.getElementById('tag-invoer-container');
  if (!container) return;
  container.querySelectorAll('.tag-item').forEach(t => t.remove());
  const input = container.querySelector('.tag-invoer-input');
  (Array.isArray(materiaalArray) ? materiaalArray : []).forEach(tag => {
    container.insertBefore(_maakTagEl(tag), input);
  });
}

/** Lees de huidige tags uit de container als string-array. */
function leesMateriaalTags() {
  const container = document.getElementById('tag-invoer-container');
  if (!container) return [];
  const input = container.querySelector('.tag-invoer-input');
  if (input?.value.trim()) {
    const tekst = input.value.trim().replace(/,+$/, '');
    if (tekst) { container.insertBefore(_maakTagEl(tekst), input); input.value = ''; }
  }
  return [...container.querySelectorAll('.tag-item')].map(el => el.dataset.waarde).filter(Boolean);
}

/**
 * Werk de status van een fiche bij (goedkeuren of afwijzen).
 *
 * @param {string} ficheID - UUID van de fiche.
 * @param {'goedgekeurd'|'afgekeurd'} nieuweStatus - De nieuwe status.
 * @returns {Promise<boolean>} True bij succes.
 */
export async function werkFicheStatusBij(ficheID, nieuweStatus) {
  try {
    const { error } = await supabase
      .from('activiteiten_fiches')
      .update({ status: nieuweStatus })
      .eq('id', ficheID);
    if (error) throw error;
    toonToast(nieuweStatus === 'goedgekeurd' ? 'Fiche goedgekeurd.' : 'Fiche afgewezen.', 'succes');
    return true;
  } catch (fout) {
    console.error('[fiches] Fout bij bijwerken fiche status:', fout.message);
    toonToast('Kon status niet bijwerken.', 'fout');
    return false;
  }
}

// ── Filteren ────────────────────────────────────────────────────────

/**
 * Filter een lijst van fiches op basis van zoekterm en filters.
 *
 * @param {object[]} fiches - De volledige lijst van fiches.
 * @param {string} zoekterm - Zoekopdracht op naam.
 * @param {object} filters - Object met optionele filtervelden.
 * @param {string} [filters.categorie] - Filter op categorie.
 * @param {string} [filters.leeftijdsgroep] - Filter op leeftijdsgroep.
 * @param {string} [filters.locatie] - Filter op binnen/buiten.
 * @param {string} [filters.moeilijkheid] - Filter op moeilijkheidsgraad.
 * @returns {object[]} Gefilterde lijst.
 */
export function filterFiches(fiches, zoekterm, filters = {}) {
  let resultaat = [...fiches];

  if (zoekterm) {
    const term = zoekterm.toLowerCase();
    resultaat = resultaat.filter(f =>
      f.naam.toLowerCase().includes(term) ||
      (f.spelregels ?? '').toLowerCase().includes(term) ||
      (f.doelstelling ?? '').toLowerCase().includes(term)
    );
  }

  if (filters.thema)          resultaat = resultaat.filter(f => f.thema === filters.thema);
  if (filters.categorie)     resultaat = resultaat.filter(f => f.categorie === filters.categorie);
  if (filters.leeftijdsgroep) resultaat = resultaat.filter(f => f.leeftijdsgroep === filters.leeftijdsgroep);
  if (filters.locatie)       resultaat = resultaat.filter(f => f.locatie === filters.locatie || f.locatie === 'beide');
  if (filters.moeilijkheid)  resultaat = resultaat.filter(f => f.moeilijkheid === filters.moeilijkheid);

  return resultaat;
}

// ── Renderen ────────────────────────────────────────────────────────

/**
 * Render een fiche-kaart (als HTML-string).
 *
 * @param {object} fiche - Het fiche-object.
 * @param {boolean} toonStatus - Of de status-badge getoond moet worden.
 * @returns {string} HTML-string voor de fiche-kaart.
 */
export function renderFicheKaart(fiche, toonStatus = false) {
  const locatieIcoon = { binnen: '🏠', buiten: '🌿', beide: '🔄' }[fiche.locatie] ?? '';
  const moeilijkheidLabel = { eenvoudig: 'Eenvoudig', gemiddeld: 'Gemiddeld', uitdagend: 'Uitdagend' }[fiche.moeilijkheid] ?? '';

  return `
    <div class="fiche-kaart" data-id="${fiche.id}" role="button" tabindex="0">
      <div class="fiche-kaart-naam">${fiche.naam}</div>
      <div class="fiche-kaart-badges">
        ${fiche.thema ? `<span class="badge badge-blauw">${themaLabel(fiche.thema)}</span>` : ''}
        ${fiche.categorie ? `<span class="badge badge-groen">${categorieLabel(fiche.categorie)}</span>` : ''}
        ${fiche.leeftijdsgroep ? `<span class="badge badge-limoen">${fiche.leeftijdsgroep}</span>` : ''}
        ${toonStatus && fiche.status === 'voorstel' ? `<span class="badge badge-koraal">Goed te keuren</span>` : ''}
        ${toonStatus && fiche.status === 'afgekeurd' ? `<span class="badge badge-grijs">Afgekeurd</span>` : ''}
      </div>
      <div class="fiche-kaart-meta">
        <span>${locatieIcoon} ${fiche.locatie ?? ''}</span>
        ${fiche.duur_minuten ? `<span>⏱ ${fiche.duur_minuten} min</span>` : ''}
        ${moeilijkheidLabel ? `<span>★ ${moeilijkheidLabel}</span>` : ''}
        ${fiche.max_deelnemers ? `<span>👥 max ${fiche.max_deelnemers}</span>` : ''}
      </div>
    </div>
  `;
}

/**
 * Render de volledige inhoud van een fiche-modal.
 *
 * @param {object} fiche - Het fiche-object.
 * @param {boolean} isBeheeder - Of de gebruiker admin/coordinator is.
 * @returns {string} HTML-string voor de modal-inhoud.
 */
export function renderFicheDetail(fiche, isBeheerder = false, isAdmin = false) {
  const aanmaker = fiche.aangemaakt_door_profiel
    ? `${ontsnap(fiche.aangemaakt_door_profiel.voornaam)} ${ontsnap(fiche.aangemaakt_door_profiel.achternaam)}`
    : 'Onbekend';

  const materiaalLijst = Array.isArray(fiche.materiaal) && fiche.materiaal.length > 0
    ? `<ul style="margin:8px 0 0 18px">${fiche.materiaal.map(m => `<li>${ontsnap(m)}</li>`).join('')}</ul>`
    : '<em>Geen materiaal vereist</em>';

  const goedkeurActies = isBeheerder && fiche.status === 'voorstel' ? `
    <button class="knop knop-middengroen" id="keur-goed-knop" data-id="${ontsnap(fiche.id)}">✓ Goedkeuren</button>
    <button class="knop knop-gevaar" id="keur-af-knop" data-id="${ontsnap(fiche.id)}">✕ Afwijzen</button>
  ` : '';

  const beheerdersActies = isBeheerder ? `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb;justify-content:space-between;align-items:center">
      ${isAdmin ? `<button class="knop knop-gevaar knop-klein" id="verwijder-fiche-knop" data-id="${ontsnap(fiche.id)}">🗑 Verwijderen</button>` : '<span></span>'}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="knop knop-primair" id="bewerk-fiche-knop" data-id="${ontsnap(fiche.id)}">✏️ Bewerken</button>
        ${goedkeurActies}
      </div>
    </div>
  ` : '';

  const statusKleur = fiche.status === 'goedgekeurd' ? 'goedgekeurd' : fiche.status === 'voorstel' ? 'voorstel' : 'afgekeurd';

  return `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      ${fiche.thema ? `<span class="badge badge-blauw">${ontsnap(themaLabel(fiche.thema))}</span>` : ''}
      ${fiche.categorie ? `<span class="badge badge-groen">${ontsnap(categorieLabel(fiche.categorie))}</span>` : ''}
      ${fiche.leeftijdsgroep ? `<span class="badge badge-limoen">${ontsnap(fiche.leeftijdsgroep)}</span>` : ''}
      ${fiche.locatie ? `<span class="badge badge-zand">${ontsnap(fiche.locatie)}</span>` : ''}
      ${fiche.moeilijkheid ? `<span class="badge badge-zand">${ontsnap(fiche.moeilijkheid)}</span>` : ''}
      <span class="badge badge-${statusKleur}">${ontsnap(fiche.status)}</span>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:12px;margin-bottom:20px">
      ${fiche.duur_minuten ? `<div><div class="font-klein kleur-grijs">Duur</div><div class="vet">${ontsnap(fiche.duur_minuten)} min</div></div>` : ''}
      ${fiche.min_deelnemers ? `<div><div class="font-klein kleur-grijs">Min. deelnemers</div><div class="vet">${ontsnap(fiche.min_deelnemers)}</div></div>` : ''}
      ${fiche.max_deelnemers ? `<div><div class="font-klein kleur-grijs">Max. deelnemers</div><div class="vet">${ontsnap(fiche.max_deelnemers)}</div></div>` : ''}
    </div>

    ${fiche.doelstelling ? `
      <div class="mb-16">
        <h4 class="mb-8">Doelstelling</h4>
        <p class="font-klein">${ontsnap(fiche.doelstelling)}</p>
      </div>
    ` : ''}

    <div class="mb-16">
      <h4 class="mb-8">Spelregels</h4>
      <p style="white-space:pre-wrap;font-size:0.88rem;line-height:1.7">${ontsnap(fiche.spelregels)}</p>
    </div>

    ${fiche.variaties ? `
      <div class="mb-16">
        <h4 class="mb-8">Variaties</h4>
        <p style="white-space:pre-wrap;font-size:0.88rem;line-height:1.7">${ontsnap(fiche.variaties)}</p>
      </div>
    ` : ''}

    ${fiche.winnaar ? `
      <div class="mb-16" style="background:rgba(215,252,92,0.18);border:1.5px solid #c5d030;border-radius:8px;padding:12px 16px">
        <h4 class="mb-8" style="color:#5a6800">🏆 Winnaar</h4>
        <p style="font-size:0.88rem;line-height:1.6;color:#5a6800">${ontsnap(fiche.winnaar)}</p>
      </div>
    ` : ''}

    <div class="mb-16">
      <h4 class="mb-8">Materiaal</h4>
      ${materiaalLijst}
    </div>

    <div class="mb-16" id="fotos-sectie-${ontsnap(fiche.id)}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h4>Foto's</h4>
        ${isBeheerder ? `
          <label class="knop knop-omtrek knop-klein" style="cursor:pointer;margin:0"
                 for="foto-upload-${ontsnap(fiche.id)}">+ Foto toevoegen</label>
          <input type="file" id="foto-upload-${ontsnap(fiche.id)}"
                 accept="image/jpeg,image/png,image/webp,image/gif" style="display:none"
                 onchange="window._handleFotoUpload(this, ${JSON.stringify(fiche.id)})">
        ` : ''}
      </div>
      <div id="fotos-raster-${ontsnap(fiche.id)}" style="display:flex;gap:8px;flex-wrap:wrap;min-height:40px">
        ${renderFotosRaster(fiche.fotos ?? [], fiche.id, isBeheerder)}
      </div>
      ${isBeheerder ? `<div id="foto-upload-status-${ontsnap(fiche.id)}" style="font-size:0.78rem;color:var(--kleur-grijs);margin-top:6px"></div>` : ''}
    </div>

    <div class="font-klein kleur-grijs" style="border-top:1px solid #e5e7eb;padding-top:12px">
      Aangemaakt door ${aanmaker}
    </div>
    ${beheerdersActies}
  `;
}

// ── Hulpfuncties ────────────────────────────────────────────────────

/**
 * Geef een leesbaar label voor een fiche-categorie.
 * @param {string} categorie
 * @returns {string}
 */
export function categorieLabel(categorie) {
  const labels = {
    'warming-up':  'Warming-up',
    'hoofdspel':   'Hoofdspel',
    'rustig_spel': 'Rustig spel',
    'afsluiter':   'Afsluiter',
    'teamspel':    'Teamspel',
    'vrij_spel':   'Vrij spel',
  };
  return labels[categorie] ?? categorie;
}

/**
 * Geef een leesbaar label (met emoji) voor een fiche-thema.
 * @param {string} thema
 * @returns {string}
 */
export function themaLabel(thema) {
  const labels = {
    'waterspelen':         '💧 Waterspelen',
    'balspelen':           '⚽ Balspelen',
    'tikspellen':          '🏃 Tikspellen',
    'estafettes':          '🏁 Estafettes',
    'rustig_concentratie': '🧩 Rustig / Concentratie',
  };
  return labels[thema] ?? thema;
}

/**
 * Bouw het fiche-voorstelformulier op als HTML-string.
 * @returns {string}
 */
export function bouwFicheFormulier() {
  return `
    <div class="formulier-rij">
      <div class="formulier-groep">
        <label for="fiche-naam">Naam *</label>
        <input type="text" id="fiche-naam" required placeholder="bv. Vossenjacht">
      </div>
      <div class="formulier-groep">
        <label for="fiche-thema">Thema</label>
        <select id="fiche-thema">
          <option value="">Geen thema</option>
          <option value="waterspelen">💧 Waterspelen</option>
          <option value="balspelen">⚽ Balspelen</option>
          <option value="tikspellen">🏃 Tikspellen</option>
          <option value="estafettes">🏁 Estafettes</option>
          <option value="rustig_concentratie">🧩 Rustig / Concentratie</option>
        </select>
      </div>
      <div class="formulier-groep">
        <label for="fiche-categorie">Categorie *</label>
        <select id="fiche-categorie" required>
          <option value="">Kies categorie…</option>
          <option value="warming-up">Warming-up</option>
          <option value="hoofdspel">Hoofdspel</option>
          <option value="rustig_spel">Rustig spel</option>
          <option value="afsluiter">Afsluiter</option>
          <option value="teamspel">Teamspel</option>
          <option value="vrij_spel">Vrij spel</option>
        </select>
      </div>
    </div>
    <div class="formulier-rij">
      <div class="formulier-groep">
        <label for="fiche-leeftijd">Leeftijdsgroep *</label>
        <input type="text" id="fiche-leeftijd" required
               list="fiche-leeftijd-suggesties"
               placeholder="bv. 6-9j of alle"
               autocomplete="off">
        <datalist id="fiche-leeftijd-suggesties">
          <option value="2.5-5j">2,5 – 5 jaar</option>
          <option value="3-5j">3 – 5 jaar</option>
          <option value="6-9j">6 – 9 jaar</option>
          <option value="6-12j">6 – 12 jaar</option>
          <option value="7-14j">7 – 14 jaar</option>
          <option value="9-14j">9 – 14 jaar</option>
          <option value="10-12j">10 – 12 jaar</option>
          <option value="10+j">10+ jaar</option>
          <option value="alle">Alle leeftijden</option>
        </datalist>
      </div>
      <div class="formulier-groep">
        <label for="fiche-locatie">Locatie</label>
        <select id="fiche-locatie">
          <option value="beide">Binnen & buiten</option>
          <option value="binnen">Enkel binnen</option>
          <option value="buiten">Enkel buiten</option>
        </select>
      </div>
    </div>
    <div class="formulier-rij">
      <div class="formulier-groep">
        <label for="fiche-duur">Duur (minuten)</label>
        <input type="number" id="fiche-duur" min="5" max="120" placeholder="bv. 30">
      </div>
      <div class="formulier-groep">
        <label for="fiche-moeilijkheid">Moeilijkheid</label>
        <select id="fiche-moeilijkheid">
          <option value="eenvoudig">Eenvoudig</option>
          <option value="gemiddeld" selected>Gemiddeld</option>
          <option value="uitdagend">Uitdagend</option>
        </select>
      </div>
      <div class="formulier-groep">
        <label for="fiche-min">Min. deelnemers</label>
        <input type="number" id="fiche-min" min="2" placeholder="bv. 6">
      </div>
      <div class="formulier-groep">
        <label for="fiche-max">Max. deelnemers</label>
        <input type="number" id="fiche-max" min="2" placeholder="bv. 30">
      </div>
    </div>
    <div class="formulier-groep">
      <label for="fiche-doelstelling">Doelstelling</label>
      <input type="text" id="fiche-doelstelling" placeholder="bv. Samenwerking en ruimtelijk inzicht">
    </div>
    <div class="formulier-groep">
      <label for="fiche-spelregels">Spelregels *</label>
      <textarea id="fiche-spelregels" required rows="5" placeholder="Beschrijf stap voor stap hoe het spel werkt…"></textarea>
    </div>
    <div class="formulier-groep">
      <label for="fiche-variaties">Variaties</label>
      <textarea id="fiche-variaties" rows="3" placeholder="Mogelijke aanpassingen of uitbreidingen…"></textarea>
    </div>
    <div class="formulier-groep">
      <label>Materiaal</label>
      <div class="tag-invoer-container" id="tag-invoer-container">
        <input type="text" id="tag-invoer-input" class="tag-invoer-input"
               placeholder="Typ een item + Enter of komma…" autocomplete="off">
      </div>
      <div class="hulptekst">Vermeld ook het aantal: "4 emmers", "2 springtouwen". Druk Enter of komma na elk item.</div>
    </div>
    <div class="formulier-groep">
      <label for="fiche-winnaar">Winnaar / afsluiting</label>
      <input type="text" id="fiche-winnaar" placeholder="bv. Het team met de meeste punten">
    </div>
  `;
}

/**
 * Lees de waarden uit het fiche-formulier en geef een object terug.
 * @returns {object|null} Fiche-data of null als validatie mislukt.
 */
export function leesFormulierWaarden() {
  const naam       = document.getElementById('fiche-naam')?.value.trim();
  const categorie  = document.getElementById('fiche-categorie')?.value;
  const leeftijd   = document.getElementById('fiche-leeftijd')?.value;
  const spelregels = document.getElementById('fiche-spelregels')?.value.trim();

  if (!naam || !categorie || !leeftijd || !spelregels) {
    toonToast('Vul alle verplichte velden in (naam, categorie, leeftijdsgroep, spelregels).', 'fout');
    return null;
  }

  const materiaal = leesMateriaalTags();

  return {
    naam,
    thema:          document.getElementById('fiche-thema')?.value || null,
    categorie,
    leeftijdsgroep: leeftijd,
    locatie:        document.getElementById('fiche-locatie')?.value ?? 'beide',
    moeilijkheid:   document.getElementById('fiche-moeilijkheid')?.value ?? 'gemiddeld',
    duur_minuten:   parseInt(document.getElementById('fiche-duur')?.value) || null,
    min_deelnemers: parseInt(document.getElementById('fiche-min')?.value) || null,
    max_deelnemers: parseInt(document.getElementById('fiche-max')?.value) || null,
    doelstelling:   document.getElementById('fiche-doelstelling')?.value.trim() || null,
    spelregels,
    variaties:      document.getElementById('fiche-variaties')?.value.trim() || null,
    materiaal,
    winnaar:        document.getElementById('fiche-winnaar')?.value.trim() || null,
  };
}

// ── Materiaaloverzicht ───────────────────────────────────────────────

/**
 * Parseer een materiaal-item naar { aantal, item }.
 * Bv. "4 emmers" → { aantal: 4, item: "emmers" }
 *     "natte sponzen" → { aantal: 1, item: "natte sponzen" }
 *
 * @param {string} tekst
 * @returns {{ aantal: number, item: string }}
 */
function parseerMateriaalItem(tekst) {
  const match = tekst.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
  if (match) {
    return {
      aantal: parseFloat(match[1].replace(',', '.')),
      item: match[2].trim().toLowerCase(),
    };
  }
  return { aantal: 1, item: tekst.trim().toLowerCase() };
}

/**
 * Haal het materiaaloverzicht op voor een kamp.
 * Leest dag_blokken (type='activiteit') gekoppeld aan fiches, groepeert per datum.
 *
 * @param {string} kampID
 * @returns {Promise<{ perDag: Map<string, {ficheName:string, materiaal:string[]}[]>, totaal: Map<string,number> }>}
 */
export async function haalMateriaaloVerzichtVoorKamp(kampID) {
  try {
    const { data, error } = await supabase
      .from('dag_blokken')
      .select(`
        datum,
        activiteiten_fiches!fiche_id (id, naam, materiaal)
      `)
      .eq('kamp_id', kampID)
      .eq('type', 'activiteit')
      .not('fiche_id', 'is', null)
      .order('datum')
      .order('start_tijd');

    if (error) throw error;

    const perDag = new Map();  // datum → [{ficheName, materiaal}]
    const totaal = new Map();  // item → aantal

    for (const blok of (data ?? [])) {
      const fiche = blok.activiteiten_fiches;
      if (!fiche || !Array.isArray(fiche.materiaal) || fiche.materiaal.length === 0) continue;

      const datum = blok.datum;
      if (!perDag.has(datum)) perDag.set(datum, []);

      // Voorkom dubbele fiches op dezelfde dag (bv. meerdere groepen)
      const reedsBekend = perDag.get(datum).some(r => r.ficheID === fiche.id);
      if (!reedsBekend) {
        perDag.get(datum).push({ ficheID: fiche.id, ficheName: fiche.naam, materiaal: fiche.materiaal });
      }

      // Totaal over alle dagen
      for (const m of fiche.materiaal) {
        const { aantal, item } = parseerMateriaalItem(m);
        totaal.set(item, (totaal.get(item) ?? 0) + aantal);
      }
    }

    // Dedupleer het totaal ook per dag (als fiche op meerdere dagen)
    // Hertelling vanuit perDag voor correct totaal
    const totaalHerberekend = new Map();
    for (const [, entries] of perDag) {
      const ficheIDsDag = new Set();
      for (const { ficheID, materiaal } of entries) {
        if (ficheIDsDag.has(ficheID)) continue;
        ficheIDsDag.add(ficheID);
        for (const m of materiaal) {
          const { aantal, item } = parseerMateriaalItem(m);
          totaalHerberekend.set(item, (totaalHerberekend.get(item) ?? 0) + aantal);
        }
      }
    }

    return { perDag, totaal: totaalHerberekend };
  } catch (fout) {
    console.error('[fiches] Materiaaloverzicht ophalen mislukt:', fout?.message);
    return { perDag: new Map(), totaal: new Map() };
  }
}

/**
 * Genereer printbaar HTML voor het materiaaloverzicht van een kamp.
 *
 * @param {{ perDag: Map, totaal: Map }} data
 * @param {string} kampNaam
 * @returns {string} HTML-string
 */
export function genereerMateriaaloVerzichtHTML(data, kampNaam) {
  const { perDag, totaal } = data;

  if (perDag.size === 0) {
    return `<div style="text-align:center;padding:32px;color:var(--kleur-grijs)">
      <div style="font-size:2rem;margin-bottom:8px">📦</div>
      <p>Geen activiteiten met materiaal gepland voor dit kamp.</p>
    </div>`;
  }

  // Datums gesorteerd
  const datums = [...perDag.keys()].sort();

  const dagBlokken = datums.map(datum => {
    const entries = perDag.get(datum);
    const dateObj = new Date(datum + 'T00:00:00');
    const dagLabel = dateObj.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });

    // Per dag: materiaal aggregeren (ontdubbeld per fiche per dag)
    const dagTotaal = new Map();
    const ficheIDsGezien = new Set();
    for (const { ficheID, materiaal } of entries) {
      if (ficheIDsGezien.has(ficheID)) continue;
      ficheIDsGezien.add(ficheID);
      for (const m of materiaal) {
        const { aantal, item } = parseerMateriaalItem(m);
        dagTotaal.set(item, (dagTotaal.get(item) ?? 0) + aantal);
      }
    }

    const ficheLijst = entries
      .filter((e, i, arr) => arr.findIndex(a => a.ficheID === e.ficheID) === i) // uniek
      .map(e => `<span class="badge badge-groen" style="font-size:0.75rem">${e.ficheName}</span>`)
      .join('');

    const materiaалRijen = [...dagTotaal.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([item, aantal]) => {
        const aantalStr = Number.isInteger(aantal) ? String(aantal) : aantal.toFixed(1).replace('.', ',');
        return `<tr>
          <td style="padding:6px 12px 6px 0;border-bottom:1px solid #e5e7eb;font-size:0.88rem">${item}</td>
          <td style="padding:6px 0;border-bottom:1px solid #e5e7eb;font-weight:700;font-size:0.88rem;color:var(--kleur-donkergroen)">${aantalStr}×</td>
        </tr>`;
      }).join('');

    return `
      <div style="margin-bottom:20px;break-inside:avoid">
        <div style="font-weight:800;font-size:0.95rem;color:var(--kleur-donkergroen);
                    padding:8px 12px;background:rgba(20,136,105,0.08);
                    border-left:4px solid var(--kleur-middengroen);border-radius:0 6px 6px 0;
                    margin-bottom:8px">
          📅 ${dagLabel}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;padding:0 4px">${ficheLijst}</div>
        <table style="width:100%;border-collapse:collapse">
          ${materiaалRijen}
        </table>
      </div>`;
  }).join('');

  const totaalRijen = [...totaal.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([item, aantal]) => {
      const aantalStr = Number.isInteger(aantal) ? String(aantal) : aantal.toFixed(1).replace('.', ',');
      return `<tr>
        <td style="padding:7px 12px 7px 0;border-bottom:1px solid #e5e7eb;font-size:0.88rem">${item}</td>
        <td style="padding:7px 0;border-bottom:1px solid #e5e7eb;font-weight:800;font-size:0.92rem;color:var(--kleur-donkergroen)">${aantalStr}×</td>
      </tr>`;
    }).join('');

  return `
    <div style="font-family:var(--font,sans-serif)">
      <h3 style="color:var(--kleur-donkergroen);margin-bottom:4px;font-size:1.05rem">
        📦 Materiaaloverzicht — ${kampNaam}
      </h3>
      <p style="font-size:0.80rem;color:var(--kleur-grijs);margin-bottom:20px">
        Gegenereerd op ${new Date().toLocaleDateString('nl-BE')}
      </p>

      <h4 style="font-size:0.88rem;text-transform:uppercase;letter-spacing:0.05em;
                 color:var(--kleur-grijs);margin-bottom:12px">Per dag</h4>
      ${dagBlokken}

      <div style="margin-top:24px;padding:16px;background:var(--kleur-donkergroen);border-radius:10px;color:white">
        <h4 style="font-size:0.88rem;text-transform:uppercase;letter-spacing:0.05em;
                   opacity:0.8;margin-bottom:12px">🗂 Totaal voor het kamp</h4>
        <table style="width:100%;border-collapse:collapse">
          ${totaalRijen}
        </table>
      </div>
    </div>
  `;
}

// ── Foto upload & beheer ─────────────────────────────────────────────

/**
 * Render het foto-raster voor de detailweergave.
 * @param {string[]} fotos - Array van publieke foto-URLs.
 * @param {string} ficheID
 * @param {boolean} isBeheerder
 * @returns {string} HTML-string
 */
export function renderFotosRaster(fotos, ficheID, isBeheerder = false) {
  if (!fotos || fotos.length === 0) {
    return `<span style="font-size:0.82rem;color:var(--kleur-grijs);font-style:italic">Nog geen foto's toegevoegd.</span>`;
  }
  return fotos.map((url, i) => {
    // Veiligheidscheck: enkel https:// URL's tonen (XSS-beveiliging tegen javascript: schema)
    const veiligUrl = (typeof url === 'string' && url.startsWith('https://')) ? url : null;
    if (!veiligUrl) return '';
    return `
    <div style="position:relative;display:inline-block">
      <img src="${ontsnap(veiligUrl)}" alt="Foto ${i + 1}"
           style="width:120px;height:80px;object-fit:cover;border-radius:8px;display:block;cursor:pointer"
           onclick="window.open(${JSON.stringify(veiligUrl)},'_blank')">
      ${isBeheerder ? `
        <button title="Foto verwijderen"
                onclick="window._verwijderFichesFoto(${JSON.stringify(ficheID)}, ${JSON.stringify(veiligUrl)})"
                style="position:absolute;top:3px;right:3px;background:rgba(255,105,85,0.85);
                       border:none;border-radius:50%;width:22px;height:22px;color:white;
                       font-size:0.78rem;cursor:pointer;line-height:1;display:flex;
                       align-items:center;justify-content:center">×</button>
      ` : ''}
    </div>`;
  }).join('');
}

/**
 * Upload een foto naar Supabase Storage en sla de URL op in de fiche.
 * @param {string} ficheID
 * @param {File} bestand
 * @returns {Promise<string|null>} Publieke URL of null bij fout.
 */
export async function uploadFichesFoto(ficheID, bestand) {
  const MAX_BYTES = 5 * 1024 * 1024;
  const TOEGESTAAN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  if (!TOEGESTAAN.includes(bestand.type)) {
    toonToast('Enkel JPEG, PNG, WebP of GIF toegestaan.', 'fout');
    return null;
  }
  if (bestand.size > MAX_BYTES) {
    toonToast('Foto is te groot (max 5 MB).', 'fout');
    return null;
  }

  try {
    const ext = bestand.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const pad = `${ficheID}/${Date.now()}.${ext}`;

    const { error: uploadFout } = await supabase.storage
      .from('fiche-fotos')
      .upload(pad, bestand, { contentType: bestand.type, upsert: false });

    if (uploadFout) throw uploadFout;

    const { data: { publicUrl } } = supabase.storage
      .from('fiche-fotos')
      .getPublicUrl(pad);

    // Haal huidige fotos op en voeg nieuwe URL toe
    const { data: fiche, error: fetchFout } = await supabase
      .from('activiteiten_fiches')
      .select('fotos')
      .eq('id', ficheID)
      .single();

    if (fetchFout) throw fetchFout;

    const nieuweFotos = [...(fiche.fotos ?? []), publicUrl];

    const { error: updateFout } = await supabase
      .from('activiteiten_fiches')
      .update({ fotos: nieuweFotos })
      .eq('id', ficheID);

    if (updateFout) throw updateFout;

    return publicUrl;
  } catch (fout) {
    console.error('[fiches] Foto upload mislukt:', fout?.message ?? fout);
    toonToast('Foto uploaden mislukt: ' + (fout?.message ?? fout), 'fout');
    return null;
  }
}

/**
 * Verwijder een foto uit Storage én uit de fotos-array van de fiche.
 * @param {string} ficheID
 * @param {string} publicUrl - De volledige publieke URL van de foto.
 * @returns {Promise<boolean>}
 */
export async function verwijderFichesFoto(ficheID, publicUrl) {
  try {
    // Haal het storage-pad op uit de publieke URL
    // Formaat: .../storage/v1/object/public/fiche-fotos/<pad>
    const match = publicUrl.match(/\/fiche-fotos\/(.+)$/);
    if (match) {
      const pad = match[1];
      const { error: removeError } = await supabase.storage.from('fiche-fotos').remove([pad]);
      // Waarschuw bij mislukking maar gooi niet — URL moet sowieso uit de DB-array
      if (removeError) console.warn('[fiches] Storage-bestand verwijderen mislukt:', removeError.message);
    }

    // Verwijder URL uit de fotos-array
    const { data: fiche, error: fetchFout } = await supabase
      .from('activiteiten_fiches')
      .select('fotos')
      .eq('id', ficheID)
      .single();

    if (fetchFout) throw fetchFout;

    const gefilterd = (fiche.fotos ?? []).filter(u => u !== publicUrl);

    const { error: updateFout } = await supabase
      .from('activiteiten_fiches')
      .update({ fotos: gefilterd })
      .eq('id', ficheID);

    if (updateFout) throw updateFout;

    toonToast('Foto verwijderd.', 'succes');
    return true;
  } catch (fout) {
    console.error('[fiches] Foto verwijderen mislukt:', fout?.message ?? fout);
    toonToast('Kon foto niet verwijderen.', 'fout');
    return false;
  }
}
