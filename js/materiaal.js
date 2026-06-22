/**
 * materiaal.js — Materiaaloverzicht per fiche en per kamp
 *
 * Toont welk materiaal nodig is voor goedgekeurde activiteitenfiches.
 * Bevat twee weergaven:
 *  1. Globale accordion: alle unieke materialen met de fiches die ze gebruiken.
 *  2. Per-kamp overzicht: checklist + per-dag accordeon voor admins/coördinatoren.
 *
 * Checkboxstatus wordt lokaal opgeslagen (localStorage) zodat voortgang bewaard blijft
 * bij het herladen van de pagina.
 *
 * @module materiaal
 */

import { supabase } from './supabase.js?v=1780304789425';
import { ontsnap, lokaleISO, datumNaarNL } from './utils.js?v=1780304789425';

// ── Data ophalen ─────────────────────────────────────────────────────

/**
 * Haal alle goedgekeurde fiches op die minstens één materiaalitem bevatten.
 * @returns {Promise<object[]>}
 */
async function haalFichesMetMateriaalOp() {
  const { data, error } = await supabase
    .from('activiteiten_fiches')
    .select('id, naam, materiaal, categorie')
    .eq('status', 'goedgekeurd')
    .order('naam');
  if (error) { console.error('[materiaal] fiches:', error.message); return []; }
  return (data ?? []).filter(f => Array.isArray(f.materiaal) && f.materiaal.length > 0);
}

/**
 * Haal aankomende actieve of concept-kampen op (einddatum >= vandaag).
 * @returns {Promise<object[]>}
 */
async function haalAankomendeKampenOp() {
  const vandaag = lokaleISO(new Date());
  const { data, error } = await supabase
    .from('kampen')
    .select('id, naam, locatie, startdatum, einddatum, leeftijdsgroep, status')
    .in('status', ['actief', 'concept'])
    .order('startdatum');
  if (error) { console.error('[materiaal] kampen:', error.message); return []; }
  return (data ?? []).filter(k => !k.einddatum || k.einddatum >= vandaag);
}

async function haalGepasseerdeKampenOp() {
  const vandaag = lokaleISO(new Date());
  const { data, error } = await supabase
    .from('kampen')
    .select('id, naam, locatie, startdatum, einddatum, leeftijdsgroep, status')
    .order('startdatum', { ascending: false })
    .limit(30);
  if (error) { console.error('[materiaal] gepasseerde kampen:', error.message); return []; }
  return (data ?? []).filter(k => k.einddatum && k.einddatum < vandaag);
}

/** Haal de trefwoord→categorie mapping op uit de database. */
async function haalMaterialenCategorieenOp() {
  const { data, error } = await supabase
    .from('materialen_categorieen')
    .select('trefwoord, categorie');
  if (error) { console.warn('[materiaal] categorieën niet beschikbaar:', error.message); return []; }
  return data ?? [];
}

// ── Materiaal-hulpfuncties ───────────────────────────────────────────

/**
 * Parseer een materiaalitem naar { aantal, item }.
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
 * Haal het materiaaloverzicht op voor één kamp.
 * Leest dag_blokken van type 'activiteit' met gekoppelde fiche.
 * Retourneert een Map per datum én een totaaltelling over het hele kamp.
 *
 * @param {string} kampID
 * @returns {Promise<{ perDag: Map<string, object[]>, totaal: Map<string, number> }>}
 */
async function haalMateriaaloVerzichtVoorKamp(kampID) {
  try {
    const { data, error } = await supabase
      .from('dag_blokken')
      .select('datum, activiteiten_fiches!fiche_id (id, naam, materiaal)')
      .eq('kamp_id', kampID)
      .eq('type', 'activiteit')
      .not('fiche_id', 'is', null)
      .order('datum')
      .order('start_tijd');

    if (error) throw error;

    // Groepeer per datum, ontdubbel fiches die meerdere keren op dezelfde dag voorkomen
    const perDag = new Map();
    for (const blok of (data ?? [])) {
      const fiche = blok.activiteiten_fiches;
      if (!fiche || !Array.isArray(fiche.materiaal) || fiche.materiaal.length === 0) continue;

      const datum = blok.datum;
      if (!perDag.has(datum)) perDag.set(datum, []);

      const reedsBekend = perDag.get(datum).some(r => r.ficheID === fiche.id);
      if (!reedsBekend) {
        perDag.get(datum).push({ ficheID: fiche.id, ficheName: fiche.naam, materiaal: fiche.materiaal });
      }
    }

    // Bereken totaal over alle dagen (ontdubbeld per fiche-ID)
    const totaal = new Map();
    for (const entries of perDag.values()) {
      const gezien = new Set();
      for (const { ficheID, materiaal } of entries) {
        if (gezien.has(ficheID)) continue;
        gezien.add(ficheID);
        for (const m of materiaal) {
          const { aantal, item } = parseerMateriaalItem(m);
          totaal.set(item, (totaal.get(item) ?? 0) + aantal);
        }
      }
    }

    return { perDag, totaal };
  } catch (fout) {
    console.error('[materiaal] Overzicht ophalen mislukt:', fout?.message);
    return { perDag: new Map(), totaal: new Map() };
  }
}

/**
 * Genereer de HTML voor het materiaaloverzicht van één kamp (lesgever-weergave).
 * Toont per dag welke fiches gebruikt worden en wat er nodig is,
 * plus een totaaloverzicht onderaan.
 *
 * @param {{ perDag: Map, totaal: Map }} data
 * @param {string} kampNaam
 * @returns {string} HTML-string
 */
function genereerMateriaaloVerzichtHTML(data, kampNaam) {
  const { perDag, totaal } = data;

  if (perDag.size === 0) {
    return `<div class="leeg-toestand">
      <div class="leeg-icoon">📦</div>
      <p>Geen activiteiten met materiaal gepland voor dit kamp.</p>
    </div>`;
  }

  const datums = [...perDag.keys()].sort();

  const dagBlokken = datums.map(datum => {
    const entries  = perDag.get(datum);
    const dateObj  = new Date(datum + 'T00:00:00');
    const dagLabel = dateObj.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });

    const dagTotaal  = new Map();
    const ficheIDsDag = new Set();
    for (const { ficheID, materiaal } of entries) {
      if (ficheIDsDag.has(ficheID)) continue;
      ficheIDsDag.add(ficheID);
      for (const m of materiaal) {
        const { aantal, item } = parseerMateriaalItem(m);
        dagTotaal.set(item, (dagTotaal.get(item) ?? 0) + aantal);
      }
    }

    const uniekeFiches = [...new Map(entries.map(e => [e.ficheID, e.ficheName])).values()];
    const ficheLijst   = uniekeFiches
      .map(naam => `<span class="badge badge-groen" style="font-size:0.73rem">${ontsnap(naam)}</span>`)
      .join('');

    const dagRijen = [...dagTotaal.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([item, aantal]) => {
        const aantalStr = Number.isInteger(aantal) ? String(aantal) : aantal.toFixed(1).replace('.', ',');
        return `<tr><td>${ontsnap(item)}</td><td>${aantalStr}&times;</td></tr>`;
      }).join('');

    return `
      <div class="mat-dag-sectie">
        <div class="mat-dag-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          ${dagLabel}
        </div>
        <div class="mat-dag-fiches">${ficheLijst}</div>
        <table class="mat-dag-tabel">${dagRijen}</table>
      </div>`;
  }).join('');

  const totaalRijen = [...totaal.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([item, aantal]) => {
      const aantalStr = Number.isInteger(aantal) ? String(aantal) : aantal.toFixed(1).replace('.', ',');
      return `<tr><td>${ontsnap(item)}</td><td>${aantalStr}&times;</td></tr>`;
    }).join('');

  return `
    <div class="mat-overzicht">
      <div class="mat-overzicht-titel">📦 Materiaaloverzicht — ${ontsnap(kampNaam)}</div>
      <div class="mat-overzicht-datum">Gegenereerd op ${new Date().toLocaleDateString('nl-BE')}</div>
      <div class="mat-overzicht-sectie-label">Per dag</div>
      ${dagBlokken}
      <div class="mat-totaal-blok">
        <div class="mat-totaal-titel">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Totaal voor het kamp
        </div>
        <table class="mat-totaal-tabel">${totaalRijen}</table>
      </div>
    </div>`;
}

// ── Globale materiaallijst (accordion per item) ──────────────────────

// Labels en kleurcodes per fiche-categorie (voor mini-kaartjes in de accordion)
const CATEGORIE_LABELS = {
  'warming-up':  'Warming-up',
  'hoofdspel':   'Hoofdspel',
  'rustig_spel': 'Rustig spel',
  'afsluiter':   'Afsluiter',
  'teamspel':    'Teamspel',
  'vrij_spel':   'Vrij spel',
};
const CATEGORIE_KLEUREN = {
  'warming-up':  '#f59e0b',
  'hoofdspel':   '#148869',
  'rustig_spel': '#3b82f6',
  'afsluiter':   '#8b5cf6',
  'teamspel':    '#ef4444',
  'vrij_spel':   '#6b7280',
};

// Metadata voor materiaalcategorieën (icoon, label, kleur)
const MATERIAAL_CAT_META = {
  sport:      { label: 'Sportmateriaal',    icoon: '🏃', kleur: '#148869' },
  water:      { label: 'Waterspelletjes',   icoon: '💧', kleur: '#3b82f6' },
  knutsel:    { label: 'Knutselmateriaal',  icoon: '🎨', kleur: '#f59e0b' },
  muziek:     { label: 'Muziek & Dans',     icoon: '🎵', kleur: '#8b5cf6' },
  spel:       { label: 'Spelmateriaal',     icoon: '🎲', kleur: '#ef4444' },
  natuur:     { label: 'Natuur & Avontuur', icoon: '🌿', kleur: '#16a34a' },
  veiligheid: { label: 'Veiligheid & EHBO', icoon: '🏥', kleur: '#6b7280' },
  diversen:   { label: 'Diversen',          icoon: '📦', kleur: '#9ca3af' },
};

/**
 * Bepaal de materiaalsectie voor één item via trefwoord-matching.
 * Kiest het langst overeenkomende trefwoord (meest specifiek).
 *
 * @param {string} itemTekst - Genormaliseerde item-naam (lowercase).
 * @param {Map<string,string>} trefwoordMap - trefwoord → categorie.
 * @returns {string} Categorie-slug.
 */
function bepaalMateriaalCategorie(itemTekst, trefwoordMap) {
  if (trefwoordMap.size === 0) return 'diversen';
  const tekst = itemTekst.toLowerCase();
  if (trefwoordMap.has(tekst)) return trefwoordMap.get(tekst);
  let besteCategorie = 'diversen';
  let besteLengte = 0;
  for (const [trefwoord, categorie] of trefwoordMap) {
    if (trefwoord.length > besteLengte && tekst.includes(trefwoord)) {
      besteCategorie = categorie;
      besteLengte = trefwoord.length;
    }
  }
  return besteCategorie;
}

/**
 * Bouw een index: itemNaam → [{ id, naam, categorie }] van alle fiches die het item gebruiken.
 *
 * @param {object[]} fiches
 * @returns {Map<string, object[]>}
 */
function bouwMaterialenIndex(fiches) {
  const index = new Map();
  for (const fiche of fiches) {
    for (const m of (fiche.materiaal ?? [])) {
      const item = parseerMateriaalItem(m).item;
      if (!index.has(item)) index.set(item, []);
      const lijst  = index.get(item);
      const bestaand = lijst.find(f => f.id === fiche.id);
      if (bestaand) {
        // Zelfde fiche, extra originele tekst (bv. "4 emmers" én "2 emmers")
        bestaand.originals.push(m);
      } else {
        lijst.push({ id: fiche.id, naam: fiche.naam, categorie: fiche.categorie ?? '', originals: [m] });
      }
    }
  }
  return index;
}

// ── Inline bewerken van materiaalregels per fiche ────────────────────

window._bewerkMateriaalRegel = function(regID) {
  const el = document.getElementById(regID);
  if (!el) return;
  el.querySelector('.mat-edit-tekst')?.classList.add('verborgen');
  el.querySelector('.mat-edit-acties')?.classList.add('verborgen');
  const form = el.querySelector('.mat-edit-form');
  form?.classList.remove('verborgen');
  form?.querySelector('input')?.focus();
};

window._annuleerMateriaalRegel = function(regID) {
  const el = document.getElementById(regID);
  if (!el) return;
  el.querySelector('.mat-edit-tekst')?.classList.remove('verborgen');
  el.querySelector('.mat-edit-acties')?.classList.remove('verborgen');
  el.querySelector('.mat-edit-form')?.classList.add('verborgen');
};

window._slaMateriaalRegelOp = async function(ficheID, oudeOrigineel, regID) {
  const input = document.getElementById(`${regID}-input`);
  const nieuwOrigineel = input?.value.trim();
  if (!nieuwOrigineel || nieuwOrigineel === oudeOrigineel) {
    window._annuleerMateriaalRegel(regID);
    return;
  }

  const { data: fiche, error } = await supabase
    .from('activiteiten_fiches')
    .select('materiaal')
    .eq('id', ficheID)
    .single();
  if (error || !fiche) return;

  const nieuwMateriaal = (fiche.materiaal ?? []).map(m => m === oudeOrigineel ? nieuwOrigineel : m);
  const { error: updateFout } = await supabase
    .from('activiteiten_fiches')
    .update({ materiaal: nieuwMateriaal })
    .eq('id', ficheID);

  const { toonToast } = await import('./utils.js?v=1780304789425');
  if (updateFout) { toonToast('Opslaan mislukt: ' + updateFout.message, 'fout'); return; }

  // Update UI zonder herladen
  const tekstEl = document.getElementById(regID)?.querySelector('.mat-edit-tekst');
  if (tekstEl) tekstEl.textContent = nieuwOrigineel;
  if (input) input.value = nieuwOrigineel;
  window._annuleerMateriaalRegel(regID);
  toonToast('Materiaal bijgewerkt.', 'succes');
};

window._verwijderMateriaalRegel = async function(ficheID, origineel, regID) {
  if (!confirm(`"${origineel}" verwijderen van deze fiche?`)) return;

  const { data: fiche, error } = await supabase
    .from('activiteiten_fiches')
    .select('materiaal')
    .eq('id', ficheID)
    .single();
  if (error || !fiche) return;

  const nieuwMateriaal = (fiche.materiaal ?? []).filter(m => m !== origineel);
  const { error: updateFout } = await supabase
    .from('activiteiten_fiches')
    .update({ materiaal: nieuwMateriaal })
    .eq('id', ficheID);

  const { toonToast } = await import('./utils.js?v=1780304789425');
  if (updateFout) { toonToast('Verwijderen mislukt: ' + updateFout.message, 'fout'); return; }

  document.getElementById(regID)?.remove();
  toonToast(`"${origineel}" verwijderd van fiche.`, 'succes');
};

/** Globale toggle-handler voor de materiaal-accordion (gezet op window voor inline onclick). */
window._toggleMateriaalRij = function(item, el) {
  const safeID = 'mat-' + item.replace(/[^a-z0-9]/g, '_');
  const detail = document.getElementById(safeID);
  if (!detail) return;
  const open = detail.classList.toggle('verborgen');
  el.setAttribute('aria-expanded', String(!open));
  const chevron = el.querySelector('.mat-chevron');
  if (chevron) chevron.classList.toggle('mat-chevron-open', !open);
};

/**
 * Render de accordion-lijst van alle unieke materialen in #materialen-lijst.
 * Elk item klapt uit met mini-kaartjes van fiches die het gebruiken.
 * Ondersteunt filteropties per materiaalsectie + tekst-zoekfilter.
 *
 * @param {object[]} fiches - Goedgekeurde fiches met materiaallijst.
 * @param {Map<string,string>} trefwoordMap - trefwoord → categorie (van DB).
 * @param {boolean} isBeheerder - Toon bewerk/verwijder-knoppen.
 */
function renderMaterialenLijst(fiches, trefwoordMap = new Map(), isBeheerder = false) {
  const container = document.getElementById('materialen-lijst');
  const teller    = document.getElementById('materialen-teller');
  if (!container) return;

  const index = bouwMaterialenIndex(fiches);
  const items = [...index.entries()].sort(([a], [b]) => a.localeCompare(b, 'nl'));

  if (teller) teller.textContent = `${items.length} unieke materialen`;

  if (items.length === 0) {
    container.innerHTML = '<p style="text-align:center;padding:24px;color:var(--kleur-grijs)">Geen materialen gevonden in goedgekeurde fiches.</p>';
    return;
  }

  // Bepaal categorie per item + tel per categorie
  const itemCategorieën = new Map();
  const categorieAantallen = new Map();
  for (const [item] of items) {
    const cat = bepaalMateriaalCategorie(item, trefwoordMap);
    itemCategorieën.set(item, cat);
    categorieAantallen.set(cat, (categorieAantallen.get(cat) ?? 0) + 1);
  }

  // Groepeer per eerste letter voor alfabetische scheidingstekens
  let huidigeLetter = '';
  const accordionHtml = items.map(([item, ficheLijst]) => {
    const gesorteerd   = [...ficheLijst].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
    const safeID       = 'mat-' + item.replace(/[^a-z0-9]/g, '_');
    const label        = gesorteerd.length === 1 ? '1 activiteit' : `${gesorteerd.length} activiteiten`;
    const ficheNamen   = gesorteerd.map(f => f.naam.toLowerCase()).join(' ');
    const eersteLetterRaw = item.trim().charAt(0).toUpperCase();
    const eersteLetter = /[A-Z]/.test(eersteLetterRaw) ? eersteLetterRaw : '#';
    const cat          = itemCategorieën.get(item) ?? 'diversen';
    const catMeta      = MATERIAAL_CAT_META[cat] ?? MATERIAAL_CAT_META.diversen;

    let scheiding = '';
    if (eersteLetter !== huidigeLetter) {
      huidigeLetter = eersteLetter;
      scheiding = `<div class="mat-letter-scheiding">
        <span class="mat-letter-badge">${eersteLetter}</span>
      </div>`;
    }

    const kaarten = gesorteerd.map(f => {
      const catLabel = CATEGORIE_LABELS[f.categorie] ?? '';
      const catKleur = CATEGORIE_KLEUREN[f.categorie] ?? '#6b7280';

      if (!isBeheerder) {
        return `<div class="fiche-mini-kaart">
          ${catLabel ? `<div class="fiche-mini-cat" style="background:${catKleur}">${catLabel}</div>` : ''}
          <div class="fiche-mini-naam">${ontsnap(f.naam)}</div>
        </div>`;
      }

      // Bewerkbare kaart voor admin/coördinator
      const regels = (f.originals ?? []).map(origineel => {
        const regID = 'mr-' + f.id.replace(/-/g, '') + '_' + origineel.replace(/[^a-z0-9]/g, '_');
        return `
          <div class="mat-edit-regel" id="${regID}">
            <span class="mat-edit-tekst">${ontsnap(origineel)}</span>
            <div class="mat-edit-acties">
              <button class="mat-edit-knop mat-edit-knop-bewerk"
                      title="Bewerk"
                      onclick="window._bewerkMateriaalRegel('${regID}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="mat-edit-knop mat-edit-knop-verwijder"
                      title="Verwijder van deze fiche"
                      onclick="window._verwijderMateriaalRegel(${ontsnap(JSON.stringify(f.id))}, ${ontsnap(JSON.stringify(origineel))}, '${regID}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/>
                </svg>
              </button>
            </div>
            <div class="mat-edit-form verborgen" id="${regID}-form">
              <input type="text" class="mat-edit-input" value="${ontsnap(origineel)}"
                     id="${regID}-input"
                     onkeydown="if(event.key==='Enter'){window._slaMateriaalRegelOp(${ontsnap(JSON.stringify(f.id))}, ${ontsnap(JSON.stringify(origineel))}, '${regID}')}else if(event.key==='Escape'){window._annuleerMateriaalRegel('${regID}')}">
              <button class="mat-edit-knop mat-edit-knop-opslaan"
                      title="Opslaan"
                      onclick="window._slaMateriaalRegelOp(${ontsnap(JSON.stringify(f.id))}, ${ontsnap(JSON.stringify(origineel))}, '${regID}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
              <button class="mat-edit-knop"
                      title="Annuleer"
                      onclick="window._annuleerMateriaalRegel('${regID}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>`;
      }).join('');

      return `<div class="fiche-mini-kaart fiche-mini-kaart-edit">
        <div class="fiche-mini-kop">
          ${catLabel ? `<span class="fiche-mini-cat" style="background:${catKleur}">${catLabel}</span>` : ''}
          <span class="fiche-mini-naam">${ontsnap(f.naam)}</span>
        </div>
        ${regels}
      </div>`;
    }).join('');

    return `${scheiding}
      <div class="mat-accordion-item" data-zoektekst="${ontsnap(item + ' ' + ficheNamen)}" data-categorie="${cat}">
        <button class="mat-accordion-knop" aria-expanded="false"
                onclick="window._toggleMateriaalRij(${ontsnap(JSON.stringify(item))}, this)">
          <span class="mat-icoon">${catMeta.icoon}</span>
          <span class="mat-label">${ontsnap(item)}</span>
          <span class="mat-cat-badge" style="--cat-kleur:${catMeta.kleur}">${catMeta.label}</span>
          <span class="badge badge-groen mat-count">${ontsnap(label)}</span>
          <svg class="mat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div class="mat-accordion-detail verborgen" id="${safeID}">
          ${kaarten}
        </div>
      </div>`;
  }).join('');

  // Bouw categorie-filter pills (enkel voor aanwezige categorieën)
  const volgorde = ['sport', 'water', 'knutsel', 'muziek', 'spel', 'natuur', 'veiligheid', 'diversen'];
  const pillsHtml = volgorde
    .filter(cat => categorieAantallen.has(cat))
    .map(cat => {
      const meta  = MATERIAAL_CAT_META[cat];
      const count = categorieAantallen.get(cat);
      return `<button class="mat-cat-pill" data-cat="${cat}" title="${meta.label}">
        <span>${meta.icoon}</span>
        <span>${meta.label}</span>
        <span class="mat-cat-teller">${count}</span>
      </button>`;
    }).join('');

  container.innerHTML = `
    <div class="mat-cat-filter" id="mat-cat-filter">
      <button class="mat-cat-pill actief" data-cat="">Alle <span class="mat-cat-teller">${items.length}</span></button>
      ${pillsHtml}
    </div>
    ${accordionHtml}
    <div class="mat-geen-resultaten" id="mat-geen-resultaten">
      Geen materialen gevonden voor "<span id="mat-zoekterm"></span>".
    </div>`;

  // ── Gecombineerd filter: zoek + categorie ─────────────────────────
  const zoek       = document.getElementById('materiaal-zoek');
  const leegEl     = document.getElementById('mat-geen-resultaten');
  const zoekTermEl = document.getElementById('mat-zoekterm');
  let activeCat    = '';

  function filterToepassen() {
    const q = (zoek?.value ?? '').toLowerCase().trim();
    let zichtbaar = 0;

    container.querySelectorAll('.mat-letter-scheiding').forEach(s => s.style.display = '');
    container.querySelectorAll('.mat-accordion-item').forEach(rij => {
      const tekst = (rij.dataset.zoektekst ?? '').toLowerCase();
      const cat   = rij.dataset.categorie ?? '';
      const match = (!q || tekst.includes(q)) && (!activeCat || cat === activeCat);
      rij.style.display = match ? '' : 'none';
      if (match) zichtbaar++;
    });

    // Verberg lege letter-secties
    container.querySelectorAll('.mat-letter-scheiding').forEach(s => {
      let el = s.nextElementSibling;
      let heeftZichtbaar = false;
      while (el && !el.classList.contains('mat-letter-scheiding')) {
        if (el.classList.contains('mat-accordion-item') && el.style.display !== 'none') {
          heeftZichtbaar = true; break;
        }
        el = el.nextElementSibling;
      }
      s.style.display = heeftZichtbaar ? '' : 'none';
    });

    if (leegEl) leegEl.classList.toggle('zichtbaar', (q !== '' || activeCat !== '') && zichtbaar === 0);
    if (zoekTermEl) zoekTermEl.textContent = q || MATERIAAL_CAT_META[activeCat]?.label || '';
    if (teller) {
      const basis = activeCat ? (categorieAantallen.get(activeCat) ?? 0) : items.length;
      teller.textContent = (q || activeCat)
        ? `${zichtbaar} van ${basis} materialen`
        : `${items.length} unieke materialen`;
    }
  }

  // Zoekbalk
  zoek?.addEventListener('input', filterToepassen);

  // Categorie-pills
  container.querySelectorAll('.mat-cat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      container.querySelectorAll('.mat-cat-pill').forEach(p => p.classList.remove('actief'));
      pill.classList.add('actief');
      activeCat = pill.dataset.cat ?? '';
      filterToepassen();
    });
  });
}

// ── Kamp-overzicht (lesgever: inklapbaar per kamp) ───────────────────

/** Toggle het materiaaloverzicht van een kampkaart. Laadt lazy bij eerste klik. */
window._toggleKampMateriaal = async function(kampID, kampNaam, knop) {
  const detail = document.getElementById(`kamp-detail-${kampID}`);
  if (!detail) return;

  if (!detail.classList.contains('verborgen')) {
    detail.classList.add('verborgen');
    knop.textContent = 'Toon materiaal';
    return;
  }

  // Laad en render bij eerste klik (lazy)
  if (!detail.dataset.geladen) {
    knop.textContent = 'Laden…';
    knop.disabled = true;
    const data = await haalMateriaaloVerzichtVoorKamp(kampID);
    detail.innerHTML = genereerMateriaaloVerzichtHTML(data, kampNaam);
    detail.dataset.geladen = '1';
    knop.disabled = false;
  }

  detail.classList.remove('verborgen');
  knop.textContent = 'Verberg';
};

/** Print het materiaaloverzicht van een kamp in een nieuw venster. */
window._printKampMateriaal = async function(kampID, kampNaam) {
  const data  = await haalMateriaaloVerzichtVoorKamp(kampID);
  const html  = genereerMateriaaloVerzichtHTML(data, kampNaam);
  const datum = new Date().toLocaleDateString('nl-BE');

  const pagina = `<!DOCTYPE html>
<html lang="nl"><head>
<meta charset="UTF-8">
<title>Materiaal — ${kampNaam}</title>
<style>
  :root { --kleur-donkergroen:#194338; --kleur-middengroen:#148869;
          --kleur-limoen:#D7FC5C; --kleur-grijs:#6B7280;
          --kleur-lichtgrijs:#E5E7EB; --kleur-tekst:#194338; }
  * { box-sizing:border-box; margin:0; padding:0 }
  body { font-family:'Helvetica Neue',sans-serif; padding:24px; color:#194338; font-size:14px }
  .badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:.73rem; font-weight:700 }
  .badge-groen { background:rgba(20,136,105,.12); color:#148869 }
  .leeg-toestand { text-align:center; padding:32px; color:var(--kleur-grijs) }
  /* Per-dag overzicht */
  .mat-overzicht { font-family:inherit }
  .mat-overzicht-titel { font-size:1rem; font-weight:800; color:var(--kleur-donkergroen); margin-bottom:2px }
  .mat-overzicht-datum { font-size:.78rem; color:var(--kleur-grijs); margin-bottom:20px }
  .mat-overzicht-sectie-label { font-size:.7rem; font-weight:800; text-transform:uppercase;
    letter-spacing:.06em; color:var(--kleur-grijs); margin-bottom:10px }
  .mat-dag-sectie { margin-bottom:12px; break-inside:avoid; border:1px solid var(--kleur-lichtgrijs);
    border-radius:6px; overflow:hidden }
  .mat-dag-header { display:flex; align-items:center; gap:8px; padding:9px 14px;
    background:var(--kleur-donkergroen); color:white; font-weight:800; font-size:.88rem }
  .mat-dag-header svg { opacity:.7; flex-shrink:0 }
  .mat-dag-fiches { display:flex; flex-wrap:wrap; gap:4px; padding:8px 12px;
    background:rgba(20,136,105,.05); border-bottom:1px solid var(--kleur-lichtgrijs) }
  .mat-dag-tabel { width:100%; border-collapse:collapse }
  .mat-dag-tabel td { padding:7px 14px; border-bottom:1px solid var(--kleur-lichtgrijs); font-size:.87rem }
  .mat-dag-tabel td:last-child { font-weight:800; color:var(--kleur-donkergroen);
    text-align:right; white-space:nowrap }
  .mat-dag-tabel tr:last-child td { border-bottom:none }
  .mat-totaal-blok { background:var(--kleur-donkergroen); border-radius:6px;
    padding:16px; margin-top:20px }
  .mat-totaal-titel { font-size:.7rem; font-weight:800; text-transform:uppercase;
    letter-spacing:.07em; color:rgba(215,252,92,.8); margin-bottom:10px;
    display:flex; align-items:center; gap:6px }
  .mat-totaal-tabel { width:100%; border-collapse:collapse }
  .mat-totaal-tabel td { padding:6px 0; border-bottom:1px solid rgba(255,255,255,.1);
    font-size:.88rem; color:rgba(255,255,255,.9) }
  .mat-totaal-tabel td:last-child { font-weight:800; color:#D7FC5C;
    text-align:right; white-space:nowrap }
  .mat-totaal-tabel tr:last-child td { border-bottom:none }
  @media print { body { padding:0 } .mat-dag-sectie { break-inside:avoid } }
</style></head><body>
<h2 style="color:#148869;margin-bottom:4px">SportFun Lesgeversportaal</h2>
<p style="color:#6b7280;font-size:.85rem;margin-bottom:24px">Afgedrukt op ${datum}</p>
${html}
</body></html>`;

  const blob = new Blob([pagina], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

/**
 * Bouw de HTML voor één kampkaart (zonder admin-checklist).
 * @param {object} kamp
 * @returns {string}
 */
function _kampPeriodeMeta(kamp) {
  const periode = [
    kamp.startdatum ? datumNaarNL(kamp.startdatum, true) : '',
    kamp.einddatum  ? datumNaarNL(kamp.einddatum, true)  : '',
  ].filter(Boolean).join(' – ');
  const meta = [periode, kamp.locatie ? ontsnap(kamp.locatie) : ''].filter(Boolean).join(' &middot; ');
  return { periode, meta };
}

function _statusBadge(status) {
  const map = { actief: ['badge-groen', 'Actief'], concept: ['badge-oranje', 'Concept'], afgelopen: ['badge-grijs', 'Afgelopen'] };
  const [cls, label] = map[status] ?? ['badge-grijs', status ?? ''];
  return label ? `<span class="badge ${cls}" style="font-size:0.7rem">${label}</span>` : '';
}

/** Kampkaart voor lesgevers: inklapbaar via "Toon materiaal" knop. */
function maakKampKaart(kamp) {
  const { meta } = _kampPeriodeMeta(kamp);
  return `
    <div class="kamp-materiaal-kaart" id="kamp-kaart-${kamp.id}">
      <div class="kamp-kaart-header">
        <div class="kamp-kaart-info">
          <div class="kamp-kaart-naam">
            ${ontsnap(kamp.naam)}
            ${_statusBadge(kamp.status)}
          </div>
          ${meta ? `<div class="kamp-kaart-meta">${meta}</div>` : ''}
        </div>
        <div class="kamp-kaart-acties geen-print">
          <button class="knop knop-omtrek knop-klein"
                  onclick="window._printKampMateriaal(${ontsnap(JSON.stringify(kamp.id))},${ontsnap(JSON.stringify(kamp.naam))})"
                  title="Print materiaaloverzicht">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print
          </button>
          <button class="knop knop-primair knop-klein"
                  id="kamp-knop-${kamp.id}"
                  onclick="window._toggleKampMateriaal(${ontsnap(JSON.stringify(kamp.id))},${ontsnap(JSON.stringify(kamp.naam))},this)">
            Toon materiaal
          </button>
        </div>
      </div>
      <div class="kamp-materiaal-detail verborgen" id="kamp-detail-${kamp.id}"></div>
    </div>`;
}

/** Kampkaart voor admins: accordion met lazy-loaded checklist en mini-voortgangsbalk. */
function maakAdminKampAccordion(kamp, isOpen) {
  const { meta } = _kampPeriodeMeta(kamp);
  return `
    <div class="admin-kamp-accordion" id="admin-acc-${kamp.id}" data-naam="${ontsnap(kamp.naam)}">
      <button class="admin-kamp-acc-knop"
              onclick="window._toggleAdminKampAccordion(${ontsnap(JSON.stringify(kamp.id))},this)">
        <svg class="admin-acc-chevron${isOpen ? ' admin-acc-chevron-open' : ''}"
             viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
        <div class="admin-kamp-acc-info">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="admin-kamp-acc-naam">${ontsnap(kamp.naam)}</span>
            ${_statusBadge(kamp.status)}
          </div>
          ${meta ? `<div class="admin-kamp-acc-meta">${meta}</div>` : ''}
        </div>
        <div class="admin-kamp-acc-rechts geen-print">
          <div class="mini-vg-wrap">
            <div class="mini-vg-balk" id="mini-balk-${kamp.id}" style="width:0%"></div>
          </div>
          <span class="mini-vg-label" id="mini-label-${kamp.id}">–</span>
          <button class="knop knop-omtrek knop-klein"
                  style="margin-left:4px"
                  onclick="event.stopPropagation();window._printKampMateriaal(${ontsnap(JSON.stringify(kamp.id))},${ontsnap(JSON.stringify(kamp.naam))})"
                  title="Print materiaaloverzicht">&#x1F5A8;</button>
        </div>
      </button>
      <div class="admin-kamp-acc-inhoud${isOpen ? '' : ' verborgen'}" id="admin-acc-inhoud-${kamp.id}">
        <div style="padding:16px;display:flex;align-items:center;gap:8px;color:var(--kleur-grijs)">
          <div class="laadindicator"></div> Laden…
        </div>
      </div>
    </div>`;
}

// ── Admin-checklist ──────────────────────────────────────────────────
// Staat-tracking via localStorage zodat checkboxen bewaard blijven
// bij herladen. Sleutel = 'mchk_<kampID>_<safe-itemnaam>'.

/** Bouw de localStorage-sleutel voor een checkbox. */
function lsKey(kampID, safeItem) {
  return `mchk_${kampID}_${safeItem}`;
}

/** Tel het aantal aangevinkte items voor een kamp. */
function telGecheckt(kampID, totaalItems) {
  return totaalItems.filter(([item]) => {
    const safe = item.replace(/[^a-z0-9]/g, '_');
    return !!localStorage.getItem(lsKey(kampID, safe));
  }).length;
}

/** Herbereken en toon de voortgangsbalk voor een kamp (groot + mini in accordion header). */
function updateVoortgang(kampID, totaalItems) {
  const gecheckt = telGecheckt(kampID, totaalItems);
  const totaal   = totaalItems.length;
  const pct      = totaal ? Math.round((gecheckt / totaal) * 100) : 0;
  const label    = document.getElementById(`vg-label-${kampID}`);
  const balk     = document.getElementById(`vg-balk-${kampID}`);
  if (label) label.textContent = `${gecheckt} / ${totaal} aangevinkt`;
  if (balk)  balk.style.width = `${pct}%`;
  // Mini-voortgangsbalk in de accordion-koptekst
  const miniBalk  = document.getElementById(`mini-balk-${kampID}`);
  const miniLabel = document.getElementById(`mini-label-${kampID}`);
  if (miniBalk)  miniBalk.style.width = `${pct}%`;
  if (miniLabel) miniLabel.textContent = `${gecheckt}/${totaal}`;
}

/** Handler voor checkbox-toggle. */
window._toggleMateriaalCheck = function(kampID, safeItem, el) {
  const key = lsKey(kampID, safeItem);
  const rij = document.getElementById(`chk-${kampID}-${safeItem}`);
  if (el.checked) {
    localStorage.setItem(key, '1');
    rij?.classList.add('chk-gedaan');
  } else {
    localStorage.removeItem(key);
    rij?.classList.remove('chk-gedaan');
  }
  // Herbereken voortgang via items opgeslagen als data-attribuut op de container
  const container = document.getElementById(`admin-ov-${kampID}`);
  try {
    const items = JSON.parse(container?.dataset.items ?? '[]');
    updateVoortgang(kampID, items);
  } catch { /* JSON parse fout — voortgang niet bijgewerkt */ }
};

/** Wis alle checkboxen van een kamp. */
window._wisKampSelectie = function(kampID) {
  const container = document.getElementById(`admin-ov-${kampID}`);
  try {
    const items = JSON.parse(container?.dataset.items ?? '[]');
    for (const [item] of items) {
      const safe = item.replace(/[^a-z0-9]/g, '_');
      localStorage.removeItem(lsKey(kampID, safe));
      const rij = document.getElementById(`chk-${kampID}-${safe}`);
      if (rij) {
        rij.classList.remove('chk-gedaan');
        const cb = rij.querySelector('input[type=checkbox]');
        if (cb) cb.checked = false;
      }
    }
    updateVoortgang(kampID, items);
  } catch { /* JSON parse fout */ }
};

/** Toggle per-dag accordion in het admin-overzicht. */
window._toggleDagAccordion = function(dagID, knop) {
  const detail = document.getElementById(dagID);
  if (!detail) return;
  const open = detail.classList.toggle('verborgen');
  knop.querySelector('.dag-chevron')?.classList.toggle('dag-chevron-open', !open);
};

/** Toggle admin-kampaccordion. Laadt checklist lazy bij eerste klik. */
window._toggleAdminKampAccordion = async function(kampID, knop) {
  const inhoud  = document.getElementById(`admin-acc-inhoud-${kampID}`);
  const chevron = knop.querySelector('.admin-acc-chevron');
  if (!inhoud) return;

  const isOpen = !inhoud.classList.contains('verborgen');
  if (isOpen) {
    inhoud.classList.add('verborgen');
    chevron?.classList.remove('admin-acc-chevron-open');
    return;
  }

  // Lazy load checklist bij eerste open
  if (!inhoud.dataset.geladen) {
    inhoud.innerHTML = '<div style="padding:16px;display:flex;align-items:center;gap:8px;color:var(--kleur-grijs)"><div class="laadindicator"></div> Laden…</div>';
    const data = await haalMateriaaloVerzichtVoorKamp(kampID);
    inhoud.innerHTML = renderAdminKampOverzicht(data, kampID);
    inhoud.dataset.geladen = '1';
    // Bijwerken mini-voortgang na laden
    try {
      const items = JSON.parse(document.getElementById(`admin-ov-${kampID}`)?.dataset.items ?? '[]');
      updateVoortgang(kampID, items);
    } catch { /* ignore */ }
  }

  inhoud.classList.remove('verborgen');
  chevron?.classList.add('admin-acc-chevron-open');
};

/** Toon/verberg afgelopen kampen. */
window._toggleAfgelopenKampen = function(knop) {
  const sectie = document.getElementById('afgelopen-kampen-lijst');
  if (!sectie) return;
  const open = sectie.classList.toggle('verborgen');
  knop.textContent = open ? knop.dataset.toonTekst : knop.dataset.verbergTekst;
};

/**
 * Render het admin-materiaaloverzicht voor één kamp.
 * Toont een checklist met voortgangsbalk + per-dag accordeons.
 *
 * @param {{ perDag: Map, totaal: Map }} data
 * @param {string} kampID
 * @returns {string} HTML-string
 */
function renderAdminKampOverzicht(data, kampID) {
  const { perDag, totaal } = data;

  if (perDag.size === 0) {
    return '<p style="text-align:center;padding:24px;color:var(--kleur-grijs)">Geen activiteiten met materiaal gepland.</p>';
  }

  const dagKeys = [...perDag.keys()].sort();

  // Bereken op welke dagen elk item nodig is
  const itemDagen = new Map();
  for (const datum of dagKeys) {
    const entries    = perDag.get(datum);
    const gezienFiche = new Set();
    for (const { ficheID, materiaal } of entries) {
      if (gezienFiche.has(ficheID)) continue;
      gezienFiche.add(ficheID);
      for (const m of materiaal) {
        const { item } = parseerMateriaalItem(m);
        if (!itemDagen.has(item)) itemDagen.set(item, []);
        const arr = itemDagen.get(item);
        if (!arr.includes(datum)) arr.push(datum);
      }
    }
  }

  const totaalItems = [...totaal.entries()].sort(([a], [b]) => a.localeCompare(b));
  const gecheckt    = telGecheckt(kampID, totaalItems);
  const pct         = totaalItems.length ? Math.round((gecheckt / totaalItems.length) * 100) : 0;

  // Checklist-rijen
  const checkRijen = totaalItems.map(([item, aantal]) => {
    const safeItem  = item.replace(/[^a-z0-9]/g, '_');
    const checked   = !!localStorage.getItem(lsKey(kampID, safeItem));
    const aantalStr = Number.isInteger(aantal) ? String(aantal) : aantal.toFixed(1).replace('.', ',');

    const dagChips = (itemDagen.get(item) ?? []).sort().map(d => {
      const dt = new Date(d + 'T00:00:00');
      return `<span class="dag-chip">${dt.toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric' })}</span>`;
    }).join('');

    return `
      <tr class="chk-rij${checked ? ' chk-gedaan' : ''}" id="chk-${kampID}-${safeItem}">
        <td class="chk-cb-cel">
          <input type="checkbox" class="admin-checkbox"${checked ? ' checked' : ''}
                 onchange="window._toggleMateriaalCheck(${ontsnap(JSON.stringify(kampID))},${ontsnap(JSON.stringify(safeItem))},this)">
        </td>
        <td class="chk-naam">${ontsnap(item)}</td>
        <td class="chk-aantal">${aantalStr}&times;</td>
        <td class="chk-dagen-cel">${dagChips}</td>
      </tr>`;
  }).join('');

  // Per-dag accordeons
  const dagHtml = dagKeys.map(datum => {
    const entries  = perDag.get(datum);
    const dateObj  = new Date(datum + 'T00:00:00');
    const dagLabel = dateObj.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });
    const dagID    = `dag-${kampID}-${datum}`;

    const gezienF    = new Set();
    let ficheBadges  = '';
    const dagMap     = new Map();

    for (const { ficheID, ficheName, materiaal } of entries) {
      if (gezienF.has(ficheID)) continue;
      gezienF.add(ficheID);
      ficheBadges += `<span class="badge badge-groen" style="font-size:0.75rem">${ontsnap(ficheName)}</span>`;
      for (const m of materiaal) {
        const { item, aantal } = parseerMateriaalItem(m);
        dagMap.set(item, (dagMap.get(item) ?? 0) + aantal);
      }
    }

    const dagChipsHtml = [...dagMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([item, aantal]) => {
        const aantalStr = Number.isInteger(aantal) ? String(aantal) : aantal.toFixed(1).replace('.', ',');
        return `<span class="dag-mat-chip">
          <span class="dag-mat-naam">${ontsnap(item)}</span>
          <span class="dag-mat-aantal">${aantalStr}&times;</span>
        </span>`;
      }).join('');

    return `
      <div class="dag-accordion-blok">
        <button class="dag-toggle-knop" onclick="window._toggleDagAccordion(${ontsnap(JSON.stringify(dagID))},this)">
          <svg class="dag-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          <span class="dag-toggle-label">${dagLabel}</span>
          <span class="dag-toggle-count">${gezienF.size} act.</span>
        </button>
        <div class="dag-detail verborgen" id="${dagID}">
          <div class="dag-fiches">${ficheBadges}</div>
          <div class="dag-mat-chips">${dagChipsHtml}</div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="admin-overzicht" id="admin-ov-${kampID}" data-items="${ontsnap(JSON.stringify(totaalItems))}">

      <!-- Checklist met voortgangsbalk -->
      <div class="admin-checklist-sectie">
        <div class="admin-checklist-header">
          <span class="admin-sectie-titel">📋 Te verzamelen</span>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="vg-label" id="vg-label-${kampID}">${gecheckt} / ${totaalItems.length} aangevinkt</span>
            <button class="knop knop-omtrek knop-klein"
                    onclick="window._wisKampSelectie(${ontsnap(JSON.stringify(kampID))})">Wis selectie</button>
          </div>
        </div>
        <div class="vg-balk-wrapper"><div class="vg-balk" id="vg-balk-${kampID}" style="width:${pct}%"></div></div>
        <table class="checklist-tabel">
          <colgroup><col style="width:36px"><col><col style="width:60px"><col></colgroup>
          <thead><tr><th></th><th>Materiaal</th><th>Aantal</th><th>Dag(en)</th></tr></thead>
          <tbody>${checkRijen}</tbody>
        </table>
      </div>

      <!-- Per-dag accordeons -->
      <div class="admin-dagen-sectie">
        <div class="admin-sectie-titel">📅 Per dag</div>
        ${dagHtml}
      </div>
    </div>`;
}

/**
 * Render kampen in #kampen-overzicht.
 * - Beheerder: accordion per kamp, lazy checklist, stats-bar, sectie afgelopen kampen.
 * - Lesgever: kampkaart met "Toon materiaal" knop, lazy load.
 *
 * @param {object[]} kampen         Actieve / aankomende kampen
 * @param {object[]} gepasseerd     Afgelopen kampen (alleen voor beheerder)
 * @param {boolean}  isBeheerder
 */
async function renderKampenOverzicht(kampen, gepasseerd, isBeheerder) {
  const container = document.getElementById('kampen-overzicht');
  if (!container) return;

  // ── Stats-bar en lesgever-hint wisselen per rol ──────────────────────
  const statsBar    = document.getElementById('admin-stats-bar');
  const lesgevHint  = document.querySelector('.lesgever-hint');
  if (statsBar) {
    statsBar.style.display = isBeheerder ? '' : 'none';
    if (isBeheerder) document.getElementById('stats-kampen-count').textContent = kampen.length;
  }
  if (lesgevHint) lesgevHint.style.display = isBeheerder ? 'none' : 'block';

  // ── Lesgever-weergave ────────────────────────────────────────────────
  if (!isBeheerder) {
    if (kampen.length === 0) {
      container.innerHTML = '<p style="text-align:center;padding:24px;color:var(--kleur-grijs)">Geen actieve of aankomende kampen gevonden.</p>';
      return;
    }
    container.innerHTML = kampen.map(maakKampKaart).join('');
    return;
  }

  // ── Beheerder-weergave: accordion + afgelopen kampen ────────────────
  if (kampen.length === 0) {
    container.innerHTML = '<p style="text-align:center;padding:24px;color:var(--kleur-grijs)">Geen actieve of aankomende kampen gevonden.</p>';
  } else {
    container.innerHTML = kampen.map((k, i) => maakAdminKampAccordion(k, i === 0)).join('');
  }

  // Laad eerste kamp direct
  if (kampen.length > 0) {
    const eersteID    = kampen[0].id;
    const eersteInhoud = document.getElementById(`admin-acc-inhoud-${eersteID}`);
    if (eersteInhoud && !eersteInhoud.dataset.geladen) {
      const data = await haalMateriaaloVerzichtVoorKamp(eersteID);
      eersteInhoud.innerHTML = renderAdminKampOverzicht(data, eersteID);
      eersteInhoud.dataset.geladen = '1';
      try {
        const items = JSON.parse(document.getElementById(`admin-ov-${eersteID}`)?.dataset.items ?? '[]');
        updateVoortgang(eersteID, items);
      } catch { /* ignore */ }
    }
  }

  // Afgelopen kampen sectie
  const afgelopenHtml = gepasseerd.length === 0 ? '' : `
    <div class="afgelopen-sectie" style="margin-top:24px">
      <button class="afgelopen-toggle-knop"
              data-toon-tekst="&#x25BC; Toon afgelopen kampen (${gepasseerd.length})"
              data-verberg-tekst="&#x25B2; Verberg afgelopen kampen"
              onclick="window._toggleAfgelopenKampen(this)">
        &#x25BC; Toon afgelopen kampen (${gepasseerd.length})
      </button>
      <div class="verborgen" id="afgelopen-kampen-lijst">
        ${gepasseerd.map(maakKampKaart).join('')}
      </div>
    </div>`;

  if (afgelopenHtml) {
    container.insertAdjacentHTML('beforeend', afgelopenHtml);
  }
}

// ── Admin: globaal hernoemen ─────────────────────────────────────────

/**
 * Render de hernoemen-lijst in #mat-hernoem-lijst.
 * Elke rij toont een materiaalitem met een inline-edit formulier.
 */
function renderHernoemLijst(items) {
  const container = document.getElementById('mat-hernoem-lijst');
  if (!container) return;
  if (items.length === 0) {
    container.innerHTML = '<p style="color:var(--kleur-grijs);font-size:0.85rem">Geen materialen gevonden.</p>';
    return;
  }

  container.innerHTML = `
    <div class="zoekbalk-wrapper" style="margin-bottom:10px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" class="zoekbalk-input" id="hernoem-zoek" placeholder="Filter materialen…" autocomplete="off">
    </div>
    ${items.map(([item, ficheLijst]) => {
      const safeID = 'hr-' + item.replace(/[^a-z0-9]/g, '_');
      return `
        <div class="mat-hernoem-rij" data-item="${ontsnap(item)}">
          <span class="mat-hernoem-naam">${ontsnap(item)}</span>
          <span class="mat-hernoem-count">${ficheLijst.length} fiche(s)</span>
          <button class="knop knop-omtrek knop-klein"
                  onclick="window._toonHernoemenForm(${ontsnap(JSON.stringify(item))})">
            Hernoem
          </button>
          <div class="mat-hernoem-inline" id="${safeID}">
            <input type="text" value="${ontsnap(item)}" id="${safeID}-input"
                   placeholder="Nieuwe naam…">
            <button class="knop knop-primair knop-klein"
                    onclick="window._hernoemMateriaal(${ontsnap(JSON.stringify(item))}, '${safeID}')">
              Opslaan
            </button>
            <button class="knop knop-omtrek knop-klein"
                    onclick="document.getElementById('${safeID}').classList.remove('zichtbaar')">
              Annuleer
            </button>
          </div>
        </div>`;
    }).join('')}`;

  // Filter
  document.getElementById('hernoem-zoek')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    container.querySelectorAll('.mat-hernoem-rij').forEach(rij => {
      rij.style.display = !q || rij.dataset.item.includes(q) ? '' : 'none';
    });
  });
}

window._toonHernoemenForm = function(item) {
  const safeID = 'hr-' + item.replace(/[^a-z0-9]/g, '_');
  const el = document.getElementById(safeID);
  if (!el) return;
  el.classList.toggle('zichtbaar');
  el.querySelector('input')?.focus();
};

window._hernoemMateriaal = async function(oudeNaam, safeID) {
  const input = document.getElementById(`${safeID}-input`);
  const nieuweNaam = input?.value.trim();
  if (!nieuweNaam || nieuweNaam === oudeNaam) return;

  const bevestig = confirm(`"${oudeNaam}" hernoemen naar "${nieuweNaam}" in alle fiches?`);
  if (!bevestig) return;

  input.disabled = true;
  try {
    // Haal alle fiches op met dit materiaalitem
    const { data: fiches, error } = await supabase
      .from('activiteiten_fiches')
      .select('id, materiaal');
    if (error) throw error;

    const teUpdaten = (fiches ?? []).filter(f =>
      Array.isArray(f.materiaal) && f.materiaal.some(m => {
        const parsed = parseerMateriaalItem(m);
        return parsed.item === oudeNaam.toLowerCase();
      })
    );

    for (const fiche of teUpdaten) {
      const nieuwMateriaal = fiche.materiaal.map(m => {
        const { aantal, item } = parseerMateriaalItem(m);
        if (item === oudeNaam.toLowerCase()) {
          return aantal !== 1 ? `${Number.isInteger(aantal) ? aantal : aantal.toFixed(1)} ${nieuweNaam}` : nieuweNaam;
        }
        return m;
      });
      const { error: updateFout } = await supabase
        .from('activiteiten_fiches')
        .update({ materiaal: nieuwMateriaal })
        .eq('id', fiche.id);
      if (updateFout) throw updateFout;
    }

    const { toonToast } = await import('./utils.js?v=1780304789425');
    toonToast(`"${oudeNaam}" hernoemd naar "${nieuweNaam}" in ${teUpdaten.length} fiche(s).`, 'succes');
    document.getElementById(safeID)?.classList.remove('zichtbaar');

    // Herlaad de materiaalpagina om de bijgewerkte lijst te tonen
    setTimeout(() => window.location.reload(), 800);
  } catch (fout) {
    const { toonToast } = await import('./utils.js?v=1780304789425');
    toonToast('Hernoemen mislukt: ' + fout.message, 'fout');
  } finally {
    if (input) input.disabled = false;
  }
};

// ── Admin: categorieën beheren ───────────────────────────────────────

function renderCatTabel(rows) {
  const wrapper = document.getElementById('mat-cat-tabel-wrapper');
  if (!wrapper) return;
  if (rows.length === 0) {
    wrapper.innerHTML = '<p style="color:var(--kleur-grijs);font-size:0.85rem">Nog geen trefwoorden toegevoegd.</p>';
    return;
  }

  const opties = [
    { value: 'sport',      label: '🏃 Sportmateriaal' },
    { value: 'water',      label: '💧 Waterspelletjes' },
    { value: 'knutsel',    label: '🎨 Knutselmateriaal' },
    { value: 'muziek',     label: '🎵 Muziek & Dans' },
    { value: 'spel',       label: '🎲 Spelmateriaal' },
    { value: 'natuur',     label: '🌿 Natuur & Avontuur' },
    { value: 'veiligheid', label: '🏥 Veiligheid & EHBO' },
    { value: 'diversen',   label: '📦 Diversen' },
  ];

  const maakOpties = (huidig) => opties
    .map(o => `<option value="${o.value}"${o.value === huidig ? ' selected' : ''}>${o.label}</option>`)
    .join('');

  wrapper.innerHTML = `
    <input type="text" class="mat-cat-zoek" id="cat-tabel-zoek" placeholder="Filter trefwoorden…">
    <table class="mat-cat-tabel">
      <thead><tr><th>Trefwoord</th><th>Categorie</th><th></th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr data-trefwoord="${ontsnap(r.trefwoord)}">
            <td><strong>${ontsnap(r.trefwoord)}</strong></td>
            <td>
              <select onchange="window._wijzigCategorie(${ontsnap(JSON.stringify(r.trefwoord))}, this.value)">
                ${maakOpties(r.categorie)}
              </select>
            </td>
            <td>
              <button class="knop knop-omtrek knop-klein"
                      style="color:var(--kleur-koraal);border-color:var(--kleur-koraal)"
                      onclick="window._verwijderTrefwoord(${ontsnap(JSON.stringify(r.trefwoord))})">
                ×
              </button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  document.getElementById('cat-tabel-zoek')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    wrapper.querySelectorAll('tr[data-trefwoord]').forEach(rij => {
      rij.style.display = !q || rij.dataset.trefwoord.includes(q) ? '' : 'none';
    });
  });
}

window._voegTrefwoordToe = async function() {
  const trefwoord = document.getElementById('mat-cat-nieuw-trefwoord')?.value.trim().toLowerCase();
  const categorie = document.getElementById('mat-cat-nieuw-categorie')?.value;
  if (!trefwoord) return;

  const { error } = await supabase.from('materialen_categorieen')
    .upsert({ trefwoord, categorie }, { onConflict: 'trefwoord' });

  const { toonToast } = await import('./utils.js?v=1780304789425');
  if (error) { toonToast('Opslaan mislukt: ' + error.message, 'fout'); return; }

  document.getElementById('mat-cat-nieuw-trefwoord').value = '';
  toonToast(`"${trefwoord}" toegevoegd als ${categorie}.`, 'succes');
  await _herlaadCatTabel();
};

window._wijzigCategorie = async function(trefwoord, nieuweCategorie) {
  const { error } = await supabase.from('materialen_categorieen')
    .update({ categorie: nieuweCategorie })
    .eq('trefwoord', trefwoord);

  const { toonToast } = await import('./utils.js?v=1780304789425');
  if (error) toonToast('Opslaan mislukt: ' + error.message, 'fout');
  else toonToast(`"${trefwoord}" → ${nieuweCategorie} opgeslagen.`, 'succes');
};

window._verwijderTrefwoord = async function(trefwoord) {
  if (!confirm(`Trefwoord "${trefwoord}" verwijderen?`)) return;
  const { error } = await supabase.from('materialen_categorieen').delete().eq('trefwoord', trefwoord);
  const { toonToast } = await import('./utils.js?v=1780304789425');
  if (error) { toonToast('Verwijderen mislukt: ' + error.message, 'fout'); return; }
  toonToast(`"${trefwoord}" verwijderd.`, 'succes');
  await _herlaadCatTabel();
};

async function _herlaadCatTabel() {
  const rows = await haalMaterialenCategorieenOp();
  renderCatTabel(rows.sort((a, b) => a.trefwoord.localeCompare(b.trefwoord, 'nl')));
}

// ── Initialisatie ────────────────────────────────────────────────────

/**
 * Initialiseer de materiaalpagina.
 * Laadt fiches en kampen parallel, rendert accordion en kampoverzicht.
 *
 * @param {object} profiel - Profiel van de ingelogde gebruiker (voor rolcheck).
 */
export async function initialiseerMateriaalPagina(profiel) {
  const isBeheerder = profiel?.rol === 'admin' || profiel?.rol === 'coordinator';

  const fetches = [haalFichesMetMateriaalOp(), haalAankomendeKampenOp(), haalMaterialenCategorieenOp()];
  if (isBeheerder) fetches.push(haalGepasseerdeKampenOp());

  const [fiches, kampen, categorieRows, gepasseerd = []] = await Promise.all(fetches);

  // Bouw een Map trefwoord → categorie voor snelle lookup
  const trefwoordMap = new Map(categorieRows.map(r => [r.trefwoord, r.categorie]));

  // Bouw materialen-index voor hernoemen en stats
  const index = bouwMaterialenIndex(fiches);
  const items = [...index.entries()].sort(([a], [b]) => a.localeCompare(b, 'nl'));

  renderMaterialenLijst(fiches, trefwoordMap, isBeheerder);

  if (isBeheerder) {
    const statsMatEl = document.getElementById('stats-materialen-count');
    if (statsMatEl) statsMatEl.textContent = items.length;

    // Toon admin-beheerkaart
    const adminKaart = document.getElementById('mat-admin-kaart');
    if (adminKaart) {
      adminKaart.style.display = '';

      // Render hernoemen-lijst
      renderHernoemLijst(items);

      // Render categorieën-tabel
      renderCatTabel(categorieRows.slice().sort((a, b) => a.trefwoord.localeCompare(b.trefwoord, 'nl')));

      // Tab-switching
      document.getElementById('mat-admin-tabs')?.addEventListener('click', (e) => {
        const tab = e.target.closest('.mat-admin-tab');
        if (!tab) return;
        const naam = tab.dataset.tab;
        document.querySelectorAll('.mat-admin-tab').forEach(t => t.classList.toggle('actief', t === tab));
        document.querySelectorAll('.mat-admin-inhoud').forEach(c => {
          c.classList.toggle('verborgen', c.id !== `mat-tab-${naam}`);
        });
      });
    }
  }

  await renderKampenOverzicht(kampen, gepasseerd, isBeheerder);
}
