/**
 * kampfilter.js — Premium inklap-filter voor kampen
 *
 * Een herbruikbare filterbalk met inklapbaar paneel.
 * Gebruikt door admin.html (kampen-tab) en planner.html (alle kampen).
 *
 * @module kampfilter
 */

import { supabase } from './supabase.js?v=1780304789425';

// ── Seizoenen ────────────────────────────────────────────────────────
export const SEIZOENEN = {
  krokus:   { label: 'Krokus',    maanden: [2, 3]   },
  pasen:    { label: 'Pasen',     maanden: [4]      },
  juli:     { label: 'Juli',      maanden: [7]      },
  augustus: { label: 'Augustus',  maanden: [8]      },
  herfst:   { label: 'Herfst',    maanden: [10, 11] },
  kerst:    { label: 'Kerst',     maanden: [12, 1]  },
};

// ── State ────────────────────────────────────────────────────────────

/** Maak een nieuwe lege filter-state. */
export function nieuweFilterState() {
  return {
    zoek:              '',
    locatie:           '',
    leeftijdsgroep:    '',
    lesgever:          '',
    seizoen:           '',
    aangepastVan:      '',
    aangepastTot:      '',
    archiefDoorzoeken: false,
  };
}

// ── Data ─────────────────────────────────────────────────────────────

/**
 * Map: kampID → Set(lesgeverIDs) voor snelle filtering op lesgever.
 */
export async function haalKoppelingsMapOp() {
  try {
    const { data, error } = await supabase
      .from('kamp_lesgevers')
      .select('kamp_id, lesgever_id, status')
      .in('status', ['bevestigd', 'gevraagd']);
    if (error) throw error;
    const map = new Map();
    for (const rij of (data ?? [])) {
      if (!map.has(rij.kamp_id)) map.set(rij.kamp_id, new Set());
      map.get(rij.kamp_id).add(rij.lesgever_id);
    }
    return map;
  } catch (fout) {
    console.error('[kampfilter] haalKoppelingsMapOp:', fout?.message ?? fout);
    return new Map();
  }
}

// ── Filteren ─────────────────────────────────────────────────────────

export function filterKampen(kampen, filter, koppelingsMap = new Map()) {
  if (!Array.isArray(kampen)) return [];
  return kampen.filter(k => {
    if (!filter.archiefDoorzoeken && k.status === 'afgelopen') return false;

    if (filter.zoek) {
      const term = filter.zoek.toLowerCase();
      const hit = (k.naam ?? '').toLowerCase().includes(term)
               || (k.locatie ?? '').toLowerCase().includes(term);
      if (!hit) return false;
    }

    if (filter.locatie && k.locatie !== filter.locatie) return false;
    if (filter.leeftijdsgroep && k.leeftijdsgroep !== filter.leeftijdsgroep) return false;

    if (filter.lesgever) {
      const set = koppelingsMap.get(k.id);
      if (!set?.has(filter.lesgever)) return false;
    }

    if (filter.seizoen) {
      const sm = new Date(k.startdatum + 'T00:00:00').getMonth() + 1;
      const em = new Date(k.einddatum  + 'T00:00:00').getMonth() + 1;
      const seizoenMaanden = SEIZOENEN[filter.seizoen]?.maanden ?? [];
      const overlap = seizoenMaanden.some(m => m >= sm && m <= em);
      if (!overlap) return false;
    }

    if (filter.aangepastVan && k.einddatum  < filter.aangepastVan)  return false;
    if (filter.aangepastTot && k.startdatum > filter.aangepastTot) return false;

    return true;
  });
}

/** Tel hoeveel filters er actief zijn (voor de badge). */
export function aantalActieveFilters(filter) {
  let n = 0;
  if (filter.zoek)             n++;
  if (filter.locatie)          n++;
  if (filter.leeftijdsgroep)   n++;
  if (filter.lesgever)         n++;
  if (filter.seizoen)          n++;
  if (filter.aangepastVan || filter.aangepastTot) n++;
  if (filter.archiefDoorzoeken) n++;
  return n;
}

// ── Render ───────────────────────────────────────────────────────────

/**
 * Render de filter-trigger en -paneel.
 *
 * @param {HTMLElement} container
 * @param {object[]} alleKampen
 * @param {object[]} alleGebruikers
 * @param {object} filter - state object (wordt gemuteerd)
 * @param {Function} onFilterWijzig - callback bij elke wijziging
 * @param {Function} [getAantalResultaten] - optioneel: callback die het aantal resultaten teruggeeft
 */
export function renderFilterBalk(container, alleKampen, alleGebruikers, filter, onFilterWijzig, getAantalResultaten) {
  try {
    if (!container) return;

    const kampenLijst    = Array.isArray(alleKampen) ? alleKampen : [];
    const gebruikersLijst = Array.isArray(alleGebruikers) ? alleGebruikers : [];

    // Unieke waarden voor pillen / dropdowns
    const locaties   = [...new Set(kampenLijst.map(k => k?.locatie).filter(Boolean))].sort();
    const leeftijden = [...new Set(kampenLijst.map(k => k?.leeftijdsgroep).filter(Boolean))].sort();
    const lesgevers  = gebruikersLijst
      .filter(u => u && ['lesgever','extra_hulp','coordinator','admin'].includes(u.rol) && u.actief)
      .sort((a, b) => (a.achternaam ?? '').localeCompare(b.achternaam ?? ''));

    const heeftAangepast = !!(filter.aangepastVan || filter.aangepastTot);

    // SVG iconen helper
    const ico = {
      filter: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
      chevron: '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
      zoek: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
      pin: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
      smile: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
      gebruiker: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      kalender: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      doos: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    };

    const heeftAangepastWaarde = !!(filter.aangepastVan || filter.aangepastTot);

    // Periode-dropdown: seizoenen + "Aangepast…" optie onderaan
    const seizoenOpties = Object.entries(SEIZOENEN).map(([k, v]) =>
      `<option value="${k}" ${filter.seizoen === k ? 'selected' : ''}>${v.label}</option>`
    ).join('');

    // Locatie en leeftijd zijn ook dropdowns
    const locatieOpties = locaties.map(l =>
      `<option value="${escapeHTML(l)}" ${filter.locatie === l ? 'selected' : ''}>${escapeHTML(l)}</option>`
    ).join('');

    const leeftijdOpties = leeftijden.map(l =>
      `<option value="${escapeHTML(l)}" ${filter.leeftijdsgroep === l ? 'selected' : ''}>${escapeHTML(l)}</option>`
    ).join('');

    const aantalActief = aantalActieveFilters(filter);

    container.innerHTML = `
      <div class="kampfilter-host">
        <!-- Trigger-rij -->
        <div class="kf-trigger-rij">
          <button type="button" class="kf-trigger" id="kf-trigger" aria-expanded="false">
            ${ico.filter}
            <span>Filteren</span>
            ${aantalActief > 0 ? `<span class="kf-trigger-badge" id="kf-badge">${aantalActief}</span>` : ''}
            ${ico.chevron}
          </button>
          <span class="kf-resultaat-info" id="kf-resultaat-info"></span>
        </div>

        <!-- Paneel -->
        <div class="kf-paneel" id="kf-paneel">
          <div class="kf-paneel-inhoud">

            <!-- Alles op één horizontale rij: zoek + 4 dropdowns + archief -->
            <div class="kf-alles-rij">

              <!-- Zoek (smaller, neemt minimale ruimte) -->
              <div class="kf-veld kf-veld-zoek">
                <label class="kf-veld-label">${ico.zoek} Zoeken</label>
                <div class="kf-zoek-paneel">
                  <input type="search" id="kf-zoek"
                         value="${escapeHTML(filter.zoek)}"
                         placeholder="Naam of locatie…">
                </div>
              </div>

              ${locaties.length > 0 ? `
                <div class="kf-veld">
                  <label class="kf-veld-label">${ico.pin} Locatie</label>
                  <select id="kf-locatie" class="kf-select-donker ${filter.locatie ? 'heeft-waarde' : ''}">
                    <option value="">Alle locaties</option>
                    ${locatieOpties}
                  </select>
                </div>
              ` : ''}

              ${leeftijden.length > 0 ? `
                <div class="kf-veld">
                  <label class="kf-veld-label">${ico.smile} Leeftijd</label>
                  <select id="kf-leeftijd" class="kf-select-donker ${filter.leeftijdsgroep ? 'heeft-waarde' : ''}">
                    <option value="">Alle leeftijden</option>
                    ${leeftijdOpties}
                  </select>
                </div>
              ` : ''}

              ${lesgevers.length > 0 ? `
                <div class="kf-veld">
                  <label class="kf-veld-label">${ico.gebruiker} Lesgever</label>
                  <select id="kf-lesgever" class="kf-select-donker ${filter.lesgever ? 'heeft-waarde' : ''}">
                    <option value="">Alle lesgevers</option>
                    ${lesgevers.map(u =>
                      `<option value="${u.id}" ${filter.lesgever === u.id ? 'selected' : ''}>${escapeHTML(u.voornaam)} ${escapeHTML(u.achternaam)}</option>`
                    ).join('')}
                  </select>
                </div>
              ` : ''}

              <!-- Periode als dropdown -->
              <div class="kf-veld">
                <label class="kf-veld-label">${ico.kalender} Periode</label>
                <select id="kf-periode" class="kf-select-donker ${(filter.seizoen || heeftAangepastWaarde) ? 'heeft-waarde' : ''}">
                  <option value="">Alle periodes</option>
                  ${seizoenOpties}
                  <option value="aangepast" ${heeftAangepastWaarde ? 'selected' : ''}>Aangepast…</option>
                </select>
              </div>

              <!-- Archief toggle (compact, helemaal rechts) -->
              <div class="kf-veld kf-veld-archief">
                <label class="kf-veld-label">${ico.doos} Archief</label>
                <label class="kf-archief-toggle">
                  <input type="checkbox" id="kf-archief" ${filter.archiefDoorzoeken ? 'checked' : ''}>
                  <span class="switch"></span>
                </label>
              </div>
            </div>

            <!-- Aangepaste datums (uitklapbaar onder de rij) -->
            <div class="kf-aangepast-wrap ${heeftAangepastWaarde ? 'open' : ''}" id="kf-aangepast-wrap">
              <div class="kf-datums-rij">
                <span class="kf-aangepast-label">Van</span>
                <input type="date" id="kf-van" value="${escapeHTML(filter.aangepastVan)}">
                <span class="pijl">→</span>
                <span class="kf-aangepast-label">Tot</span>
                <input type="date" id="kf-tot" value="${escapeHTML(filter.aangepastTot)}">
              </div>
            </div>

            <!-- Chips -->
            <div class="kf-chips-sectie">
              <span class="kf-chips-titel">Actieve filters</span>
              <div class="kf-chips-rij" id="kf-chips"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    // ── Trigger: open/dicht ──
    const trigger = container.querySelector('#kf-trigger');
    const paneel  = container.querySelector('#kf-paneel');
    trigger.addEventListener('click', () => {
      const open = paneel.classList.toggle('open');
      trigger.classList.toggle('open', open);
      trigger.setAttribute('aria-expanded', String(open));
    });

    // Klik buiten → dichtklappen
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target) && paneel.classList.contains('open')) {
        paneel.classList.remove('open');
        trigger.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    // ── Zoekveld ──
    let zoekTimer;
    container.querySelector('#kf-zoek').addEventListener('input', (e) => {
      clearTimeout(zoekTimer);
      zoekTimer = setTimeout(() => {
        filter.zoek = e.target.value.trim();
        gewijzigd();
      }, 200);
    });

    // ── Locatie-dropdown ──
    const locatieSel = container.querySelector('#kf-locatie');
    if (locatieSel) {
      locatieSel.addEventListener('change', (e) => {
        filter.locatie = e.target.value;
        e.target.classList.toggle('heeft-waarde', !!e.target.value);
        gewijzigd();
      });
    }

    // ── Leeftijd-dropdown ──
    const leeftijdSel = container.querySelector('#kf-leeftijd');
    if (leeftijdSel) {
      leeftijdSel.addEventListener('change', (e) => {
        filter.leeftijdsgroep = e.target.value;
        e.target.classList.toggle('heeft-waarde', !!e.target.value);
        gewijzigd();
      });
    }

    // ── Lesgever-dropdown ──
    const lesgeverSel = container.querySelector('#kf-lesgever');
    if (lesgeverSel) {
      lesgeverSel.addEventListener('change', (e) => {
        filter.lesgever = e.target.value;
        e.target.classList.toggle('heeft-waarde', !!e.target.value);
        gewijzigd();
      });
    }

    // ── Periode-dropdown ──
    const aangepastWrap = container.querySelector('#kf-aangepast-wrap');
    const periodeSel = container.querySelector('#kf-periode');
    if (periodeSel) {
      periodeSel.addEventListener('change', (e) => {
        const waarde = e.target.value;
        if (waarde === 'aangepast') {
          filter.seizoen = '';
          aangepastWrap.classList.add('open');
          periodeSel.classList.add('heeft-waarde');
        } else if (waarde === '') {
          filter.seizoen = '';
          filter.aangepastVan = '';
          filter.aangepastTot = '';
          container.querySelector('#kf-van').value = '';
          container.querySelector('#kf-tot').value = '';
          aangepastWrap.classList.remove('open');
          periodeSel.classList.remove('heeft-waarde');
        } else {
          filter.seizoen = waarde;
          filter.aangepastVan = '';
          filter.aangepastTot = '';
          container.querySelector('#kf-van').value = '';
          container.querySelector('#kf-tot').value = '';
          aangepastWrap.classList.remove('open');
          periodeSel.classList.add('heeft-waarde');
        }
        gewijzigd();
      });
    }

    // ── Datumvelden ──
    container.querySelector('#kf-van').addEventListener('change', (e) => {
      filter.aangepastVan = e.target.value;
      filter.seizoen = '';
      if (periodeSel) {
        periodeSel.value = 'aangepast';
        periodeSel.classList.add('heeft-waarde');
      }
      gewijzigd();
    });
    container.querySelector('#kf-tot').addEventListener('change', (e) => {
      filter.aangepastTot = e.target.value;
      filter.seizoen = '';
      if (periodeSel) {
        periodeSel.value = 'aangepast';
        periodeSel.classList.add('heeft-waarde');
      }
      gewijzigd();
    });

    // ── Archief ──
    container.querySelector('#kf-archief').addEventListener('change', (e) => {
      filter.archiefDoorzoeken = e.target.checked;
      gewijzigd();
    });

    // ── Chip globale handlers ──
    window._wisFilterVeld = (veld) => {
      if (veld === 'periode') {
        filter.seizoen = '';
        filter.aangepastVan = '';
        filter.aangepastTot = '';
        const periodeSel = container.querySelector('#kf-periode');
        if (periodeSel) { periodeSel.value = ''; periodeSel.classList.remove('heeft-waarde'); }
        container.querySelector('#kf-aangepast-wrap').classList.remove('open');
        const vanEl = container.querySelector('#kf-van');
        const totEl = container.querySelector('#kf-tot');
        if (vanEl) vanEl.value = '';
        if (totEl) totEl.value = '';
      } else if (veld === 'locatie') {
        filter.locatie = '';
        const sel = container.querySelector('#kf-locatie');
        if (sel) { sel.value = ''; sel.classList.remove('heeft-waarde'); }
      } else if (veld === 'leeftijdsgroep') {
        filter.leeftijdsgroep = '';
        const sel = container.querySelector('#kf-leeftijd');
        if (sel) { sel.value = ''; sel.classList.remove('heeft-waarde'); }
      } else if (veld === 'archiefDoorzoeken') {
        filter.archiefDoorzoeken = false;
        container.querySelector('#kf-archief').checked = false;
      } else if (veld === 'zoek') {
        filter.zoek = '';
        container.querySelector('#kf-zoek').value = '';
      } else if (veld === 'lesgever') {
        filter.lesgever = '';
        const sel = container.querySelector('#kf-lesgever');
        if (sel) { sel.value = ''; sel.classList.remove('heeft-waarde'); }
      }
      gewijzigd();
    };

    window._wisAlleFilters = () => {
      Object.assign(filter, nieuweFilterState());
      container.querySelector('#kf-zoek').value = '';
      container.querySelectorAll('.kf-pil.actief').forEach(p => p.classList.remove('actief'));
      ['#kf-locatie', '#kf-leeftijd', '#kf-lesgever', '#kf-periode'].forEach(sel => {
        const el = container.querySelector(sel);
        if (el) { el.value = ''; el.classList.remove('heeft-waarde'); }
      });
      container.querySelector('#kf-archief').checked = false;
      const vanEl = container.querySelector('#kf-van');
      const totEl = container.querySelector('#kf-tot');
      if (vanEl) vanEl.value = '';
      if (totEl) totEl.value = '';
      container.querySelector('#kf-aangepast-wrap').classList.remove('open');
      gewijzigd();
    };

    // ── Wijzigingen verwerken ──
    function gewijzigd() {
      updateBadge(container, filter);
      renderChips(filter, gebruikersLijst);
      onFilterWijzig();
      updateResultaatInfo(container, getAantalResultaten);
    }

    // Eerste render van chips + resultaat-info
    renderChips(filter, gebruikersLijst);
    updateResultaatInfo(container, getAantalResultaten);

  } catch (fout) {
    console.error('[kampfilter] renderFilterBalk fout:', fout);
    container.innerHTML = `
      <div style="padding:10px;background:#FFF3CD;border:1px solid #FFE69C;
                  border-radius:8px;font-size:0.85rem;color:#856404">
        ⚠️ Kon filterbalk niet renderen. Open F12 → Console voor details.
      </div>`;
  }
}

/**
 * Update de badge op de trigger-knop op basis van aantal actieve filters.
 */
function updateBadge(container, filter) {
  const trigger = container.querySelector('#kf-trigger');
  if (!trigger) return;
  const n = aantalActieveFilters(filter);
  let badge = container.querySelector('#kf-badge');
  if (n > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'kf-badge';
      badge.className = 'kf-trigger-badge';
      trigger.insertBefore(badge, trigger.querySelector('.chevron'));
    }
    badge.textContent = n;
  } else if (badge) {
    badge.remove();
  }
}

/**
 * Render het aantal resultaten naast de trigger.
 */
function updateResultaatInfo(container, getAantalResultaten) {
  const info = container.querySelector('#kf-resultaat-info');
  if (!info || typeof getAantalResultaten !== 'function') return;
  try {
    const n = getAantalResultaten();
    info.innerHTML = `<strong>${n}</strong> ${n === 1 ? 'kamp' : 'kampen'} gevonden`;
  } catch {
    info.innerHTML = '';
  }
}

/** Render de actieve filter-chips in de chips-sectie. */
function renderChips(filter, alleGebruikers) {
  const container = document.getElementById('kf-chips');
  if (!container) return;

  const chips = [];
  if (filter.zoek)
    chips.push({ label: `Zoek: "${filter.zoek}"`, veld: 'zoek' });
  if (filter.locatie)
    chips.push({ label: filter.locatie, veld: 'locatie' });
  if (filter.leeftijdsgroep)
    chips.push({ label: filter.leeftijdsgroep, veld: 'leeftijdsgroep' });
  if (filter.lesgever) {
    const u = (alleGebruikers ?? []).find(g => g.id === filter.lesgever);
    chips.push({ label: u ? `${u.voornaam} ${u.achternaam}` : 'Lesgever', veld: 'lesgever' });
  }
  if (filter.seizoen)
    chips.push({ label: SEIZOENEN[filter.seizoen]?.label ?? '', veld: 'periode' });
  if (filter.aangepastVan || filter.aangepastTot) {
    const v = filter.aangepastVan || '…';
    const t = filter.aangepastTot || '…';
    chips.push({ label: `${v} → ${t}`, veld: 'periode' });
  }
  if (filter.archiefDoorzoeken)
    chips.push({ label: 'Incl. archief', veld: 'archiefDoorzoeken' });

  if (chips.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = chips.map(c => `
    <span class="kf-chip">
      ${escapeHTML(c.label)}
      <button type="button" class="kf-chip-x"
              onclick="window._wisFilterVeld('${c.veld}')"
              aria-label="Verwijderen">×</button>
    </span>
  `).join('') + `
    <button type="button" class="kf-wis-knop" onclick="window._wisAlleFilters()">
      Wis alles
    </button>
  `;
}

/** Helper: escape HTML in user-strings. */
function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
