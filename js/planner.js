/**
 * planner.js — Plannerlogica voor lesgevers
 *
 * Beheert de volledige lesgeverflow:
 *  - Open kampen bekijken en beschikbaarheid ingeven
 *  - Uitnodigingen aanvaarden of weigeren (optioneel reden)
 *  - Bevestigde kampen annuleren (reden verplicht)
 *  - Weekoverzicht met dagprogramma's
 *
 * @module planner
 */

import { supabase } from './supabase.js?v=1780304789425';
import { toonToast, formateerDatum, datumNaarNL, dagNaam, lokaleISO } from './utils.js?v=1780304789425';
import { maakNotificatie } from './auth.js?v=1780304789425';

// ── Alle toekomstige kampen met beschikbaarheidsstatus ──────────────

/**
 * Haal alle toekomstige kampen op (ongeacht koppeling of beschikbaarheid_open),
 * samen met de bestaande beschikbaarheid van de opgegeven lesgever.
 *
 * @param {string} lesgeverID
 * @returns {Promise<Array<{kamp: object, beschikbaarheid: object|null}>>}
 */
export async function haalToekomstigeKampenMetBeschikbaarheidOp(lesgeverID) {
  try {
    const vandaag = lokaleISO(new Date());
    const [{ data: kampen, error: kFout }, { data: besch }] = await Promise.all([
      supabase
        .from('kampen')
        .select('id, naam, locatie, startdatum, einddatum, leeftijdsgroep, status')
        .neq('status', 'afgelopen')
        .gte('einddatum', vandaag)
        .order('startdatum', { ascending: true }),
      supabase
        .from('beschikbaarheden')
        .select('kamp_id, beschikbaar, onbeschikbare_dagen, opmerking')
        .eq('lesgever_id', lesgeverID),
    ]);
    if (kFout) throw kFout;
    const beschMap = new Map((besch ?? []).map(b => [b.kamp_id, b]));
    return (kampen ?? []).map(kamp => ({
      kamp,
      beschikbaarheid: beschMap.get(kamp.id) ?? null,
    }));
  } catch (fout) {
    console.error('[planner] haalToekomstigeKampenMetBeschikbaarheidOp:', fout.message);
    return [];
  }
}

// ── Uitnodigingen (gevraagd / bevestigd / geweigerd) ────────────────

/**
 * Haal alle koppelingen op voor de lesgever, inclusief kampinfo.
 * Geeft alle statussen terug: gevraagd, bevestigd, geweigerd, geannuleerd.
 *
 * @param {string} lesgeverID
 * @returns {Promise<object[]>}
 */
export async function haalMijnKoppelingenOp(lesgeverID) {
  try {
    const { data, error } = await supabase
      .from('kamp_lesgevers')
      .select(`
        id, status, weigeringsreden, annuleringsreden,
        gevraagd_op, beantwoord_op,
        kampen (id, naam, locatie, startdatum, einddatum, leeftijdsgroep, status, verantwoordelijke)
      `)
      .eq('lesgever_id', lesgeverID)
      .order('gevraagd_op', { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch (fout) {
    console.error('[planner] Fout bij ophalen koppelingen:', fout.message);
    return [];
  }
}

/**
 * Haal enkel de openstaande uitnodigingen op (status = 'gevraagd').
 *
 * @param {string} lesgeverID
 * @returns {Promise<object[]>}
 */
export async function haalUitnodigingenOp(lesgeverID) {
  const alles = await haalMijnKoppelingenOp(lesgeverID);
  return alles.filter(k => k.status === 'gevraagd');
}

/**
 * Haal enkel de bevestigde kampen op (status = 'bevestigd').
 *
 * @param {string} lesgeverID
 * @returns {Promise<object[]>}
 */
export async function haalBevestigdeKampenOp(lesgeverID) {
  const alles = await haalMijnKoppelingenOp(lesgeverID);
  return alles.filter(k => k.status === 'bevestigd');
}

// ── Uitnodiging beantwoorden ────────────────────────────────────────

/**
 * Aanvaard een uitnodiging. Zet status op 'bevestigd'.
 * Stuurt een notificatie naar alle admins/coördinatoren van het kamp.
 *
 * @param {string} koppelingID - UUID van de kamp_lesgevers rij.
 * @param {object} lesgever - Profiel van de lesgever (voor notificatietekst).
 * @param {string} kampNaam - Naam van het kamp.
 * @returns {Promise<boolean>}
 */
export async function aanvaardKoppeling(koppelingID, lesgever, kampNaam) {
  try {
    const { data: koppeling, error } = await supabase
      .from('kamp_lesgevers')
      .update({
        status:        'bevestigd',
        beantwoord_op: new Date().toISOString(),
      })
      .eq('id', koppelingID)
      .select('kamp_id, lesgever_id')
      .single();
    if (error) throw error;

    // Automatisch contract aanmaken bij bevestigd
    if (koppeling) {
      try {
        const { genereerContractAutomatisch } = await import('./contracten.js?v=1780304789425');
        await genereerContractAutomatisch(koppeling.lesgever_id, koppeling.kamp_id);
      } catch (e) {
        console.warn('[planner] Auto-contract aanmaken mislukt:', e?.message);
      }
    }

    // Notificeer de verantwoordelijken
    await stuurAdminNotificatie(
      koppelingID,
      'bevestigd',
      `${lesgever.voornaam} ${lesgever.achternaam} heeft de uitnodiging voor "${kampNaam}" aanvaard.`,
      'admin.html'
    );

    await stuurEmailNotificatie({
      type:     'bevestigd',
      naam:     `${lesgever.voornaam} ${lesgever.achternaam}`,
      kampNaam,
    });

    toonToast(`Je deelname aan "${kampNaam}" is bevestigd.`, 'succes');
    return true;
  } catch (fout) {
    console.error('[planner] Fout bij aanvaarden koppeling:', fout.message);
    toonToast('Kon uitnodiging niet aanvaarden.', 'fout');
    return false;
  }
}

/**
 * Weiger een uitnodiging. Zet status op 'geweigerd'.
 * Reden is optioneel maar wordt opgeslagen als opgegeven.
 *
 * @param {string} koppelingID
 * @param {object} lesgever
 * @param {string} kampNaam
 * @param {string|null} reden - Optionele weigeringsreden.
 * @returns {Promise<boolean>}
 */
export async function weigerKoppeling(koppelingID, lesgever, kampNaam, reden = null) {
  try {
    const { error } = await supabase
      .from('kamp_lesgevers')
      .update({
        status:           'geweigerd',
        weigeringsreden:  reden || null,
        beantwoord_op:    new Date().toISOString(),
      })
      .eq('id', koppelingID);
    if (error) throw error;

    const redenTekst = reden ? ` Reden: "${reden}"` : '';
    await stuurAdminNotificatie(
      koppelingID,
      'geweigerd',
      `${lesgever.voornaam} ${lesgever.achternaam} heeft de uitnodiging voor "${kampNaam}" geweigerd.${redenTekst}`,
      'admin.html'
    );

    await stuurEmailNotificatie({
      type:     'geweigerd',
      naam:     `${lesgever.voornaam} ${lesgever.achternaam}`,
      kampNaam,
      reden,
    });

    toonToast(`Uitnodiging voor "${kampNaam}" geweigerd.`, 'info');
    return true;
  } catch (fout) {
    console.error('[planner] Fout bij weigeren koppeling:', fout.message);
    toonToast('Kon uitnodiging niet weigeren.', 'fout');
    return false;
  }
}

/**
 * Annuleer een bevestigde koppeling. Reden is verplicht.
 *
 * @param {string} koppelingID
 * @param {object} lesgever
 * @param {string} kampNaam
 * @param {string} reden - Verplichte annuleringsreden.
 * @returns {Promise<boolean>}
 */
export async function annuleerKoppeling(koppelingID, lesgever, kampNaam, reden) {
  if (!reden?.trim()) {
    toonToast('Geef een reden op voor de annulering.', 'fout');
    return false;
  }
  try {
    const { error } = await supabase
      .from('kamp_lesgevers')
      .update({
        status:            'geannuleerd',
        annuleringsreden:  reden.trim(),
        beantwoord_op:     new Date().toISOString(),
      })
      .eq('id', koppelingID);
    if (error) throw error;

    await stuurAdminNotificatie(
      koppelingID,
      'geannuleerd',
      `${lesgever.voornaam} ${lesgever.achternaam} heeft deelname aan "${kampNaam}" geannuleerd. Reden: "${reden.trim()}"`,
      'admin.html'
    );

    await stuurEmailNotificatie({
      type:     'geannuleerd',
      naam:     `${lesgever.voornaam} ${lesgever.achternaam}`,
      kampNaam,
      reden,
    });

    toonToast(`Deelname aan "${kampNaam}" geannuleerd.`, 'info');
    return true;
  } catch (fout) {
    console.error('[planner] Fout bij annuleren koppeling:', fout.message);
    toonToast('Kon koppeling niet annuleren.', 'fout');
    return false;
  }
}

// ── Beschikbaarheid ─────────────────────────────────────────────────

/**
 * Haal de beschikbaarheid op van een lesgever voor een specifiek kamp.
 *
 * @param {string} lesgeverID
 * @param {string} kampID
 * @returns {Promise<object|null>}
 */
export async function haalBeschikbaarheidOp(lesgeverID, kampID) {
  try {
    const { data, error } = await supabase
      .from('beschikbaarheden')
      .select('*')
      .eq('lesgever_id', lesgeverID)
      .eq('kamp_id', kampID)
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (fout) {
    console.error('[planner] Fout bij ophalen beschikbaarheid:', fout.message);
    return null;
  }
}

/**
 * Sla de beschikbaarheid op (nieuw of bijwerken).
 *
 * @param {string} lesgeverID
 * @param {string} kampID
 * @param {boolean} beschikbaar
 * @param {string[]} onbeschikbareDagen
 * @param {string} opmerking
 * @returns {Promise<boolean>}
 */
export async function slaaBeschikbaarheidOp(lesgeverID, kampID, beschikbaar, onbeschikbareDagen, opmerking) {
  try {
    const { error } = await supabase
      .from('beschikbaarheden')
      .upsert({
        lesgever_id:       lesgeverID,
        kamp_id:           kampID,
        beschikbaar,
        onbeschikbare_dagen: onbeschikbareDagen,
        opmerking,
        ingediend_op:      new Date().toISOString(),
      }, { onConflict: 'lesgever_id,kamp_id' });
    if (error) throw error;
    toonToast('Beschikbaarheid opgeslagen.', 'succes');
    return true;
  } catch (fout) {
    console.error('[planner] Fout bij opslaan beschikbaarheid:', fout.message);
    toonToast('Kon beschikbaarheid niet opslaan.', 'fout');
    return false;
  }
}

// ── Dagprogramma's ──────────────────────────────────────────────────

/**
 * Haal alle dagprogramma's op voor een kamp, inclusief fiches.
 *
 * @param {string} kampID
 * @returns {Promise<object[]>}
 */
export async function haalDagprogrammasOp(kampID) {
  try {
    const { data, error } = await supabase
      .from('dagprogrammas')
      .select(`
        id, datum,
        dagprogramma_fiches (
          id, volgorde, tijdstip, notitie,
          activiteiten_fiches (
            id, naam, categorie, duur_minuten, locatie, moeilijkheid, leeftijdsgroep
          )
        )
      `)
      .eq('kamp_id', kampID)
      .order('datum');
    if (error) throw error;
    return (data ?? []).map(dag => ({
      ...dag,
      fiches: (dag.dagprogramma_fiches ?? [])
        .sort((a, b) => a.volgorde - b.volgorde)
        .map(df => ({ ...df.activiteiten_fiches, ...df })),
    }));
  } catch (fout) {
    console.error('[planner] Fout bij ophalen dagprogrammas:', fout.message);
    return [];
  }
}

// ── Renderen ────────────────────────────────────────────────────────

/**
 * Haal de team-info op voor een kamp: coördinator + alle bevestigde lesgevers
 * inclusief of ze hun beschikbaarheid hebben ingediend.
 *
 * @param {string} kampID
 * @param {string} verantwoordelijkeID - UUID van de verantwoordelijke (mag null zijn).
 * @returns {Promise<{coordinator: object|null, lesgevers: object[]}>}
 */
export async function haalKampTeamOp(kampID, verantwoordelijkeID) {
  try {
    // 1. Verantwoordelijke/coördinator profiel
    let coordinator = null;
    if (verantwoordelijkeID) {
      const { data } = await supabase
        .from('profielen')
        .select('id, voornaam, achternaam, rol')
        .eq('id', verantwoordelijkeID).maybeSingle();
      coordinator = data ?? null;
    }

    // 2. Bevestigde lesgevers + status van beschikbaarheid
    const { data: koppelingen } = await supabase
      .from('kamp_lesgevers')
      .select('lesgever_id, status, profielen!lesgever_id(id, voornaam, achternaam, rol)')
      .eq('kamp_id', kampID)
      .in('status', ['bevestigd', 'gevraagd']);

    const lesgeverIDs = (koppelingen ?? []).map(k => k.lesgever_id);

    let beschikMap = new Map();
    if (lesgeverIDs.length > 0) {
      const { data: beschikbaar } = await supabase
        .from('beschikbaarheden')
        .select('lesgever_id, beschikbaar, onbeschikbare_dagen, ingediend_op')
        .eq('kamp_id', kampID)
        .in('lesgever_id', lesgeverIDs);
      for (const b of (beschikbaar ?? [])) beschikMap.set(b.lesgever_id, b);
    }

    const lesgevers = (koppelingen ?? []).map(k => ({
      ...k.profielen,
      koppelingsStatus: k.status,
      beschikbaarheid: beschikMap.get(k.lesgever_id) ?? null,
    }));

    return { coordinator, lesgevers };
  } catch (fout) {
    console.error('[planner] haalKampTeamOp mislukt:', fout?.message);
    return { coordinator: null, lesgevers: [] };
  }
}

/**
 * Render de team-strook bovenaan een admin-kampkaart.
 * @param {{coordinator: object|null, lesgevers: object[]}} teamInfo
 * @returns {string}
 */
function renderTeamStrook(teamInfo) {
  const { coordinator, lesgevers } = teamInfo;

  // Tel statussen
  const totaalLg     = lesgevers.length;
  const metBeschik   = lesgevers.filter(l => l.beschikbaarheid).length;
  const zonderBeschik = totaalLg - metBeschik;

  // Coördinator-chip
  const coordChip = coordinator
    ? `<span class="team-chip coord" title="Verantwoordelijke">
         <span class="team-rol">👤 Coördinator</span>
         <span>${coordinator.voornaam} ${coordinator.achternaam}</span>
       </span>`
    : `<span class="team-chip leeg">
         <span class="team-rol">👤 Coördinator</span>
         <span>Niet toegewezen</span>
       </span>`;

  // Lesgever-chips
  let lesgeverChips;
  if (totaalLg === 0) {
    lesgeverChips = `<span class="team-chip leeg">Nog geen lesgevers gekoppeld</span>`;
  } else {
    lesgeverChips = lesgevers.map(l => {
      const isAanvraag = l.koppelingsStatus === 'gevraagd';
      const heeftBeschik = !!l.beschikbaarheid;
      const onbeschikbaar = l.beschikbaarheid?.onbeschikbare_dagen ?? [];
      const indicator = isAanvraag
        ? `<span class="team-status wacht" title="Wacht op antwoord">⏳</span>`
        : heeftBeschik
          ? (onbeschikbaar.length > 0
              ? `<span class="team-status deels" title="${onbeschikbaar.length} dag(en) onbeschikbaar">⚠</span>`
              : `<span class="team-status ok" title="Beschikbaarheid ingediend">✓</span>`)
          : `<span class="team-status mist" title="Geen beschikbaarheid ingediend">○</span>`;
      const rolLabel = { lesgever: 'Lesgever', extra_hulp: 'Extra hulp', coordinator: 'Coördinator', admin: 'Beheerder' }[l.rol] ?? l.rol;
      return `
        <span class="team-chip lg ${isAanvraag ? 'wacht' : heeftBeschik ? 'ok' : 'mist'}"
              title="${rolLabel}${isAanvraag ? ' — wacht op antwoord' : heeftBeschik ? ' — beschikbaarheid ingediend' : ' — beschikbaarheid niet ingediend'}">
          ${indicator}
          <span>${l.voornaam} ${l.achternaam}</span>
        </span>
      `;
    }).join('');
  }

  const samenvatting = totaalLg > 0
    ? `<span class="team-sum">${metBeschik}/${totaalLg} planning ingevuld${zonderBeschik > 0 ? ' · ' + zonderBeschik + ' nog niet' : ''}</span>`
    : '';

  return `
    <div class="team-strook">
      <div class="team-rij">
        ${coordChip}
        ${lesgeverChips}
      </div>
      ${samenvatting}
    </div>
  `;
}

/**
 * Render een volledige kampkaart voor admin/coördinator.
 * Toont weekoverzicht met volledige bewerkopties (+ en ×) voor dag-programma's.
 * Geen lesgever-specifieke elementen (geen annuleren/aanvaarden).
 *
 * @param {object} kamp - Kamp-object (uit kampen tabel).
 * @param {object[]} dagprogrammas - Dagprogramma's met fiches voor dit kamp.
 * @param {object} [teamInfo] - Team-info met coördinator + lesgevers + beschikbaarheidsstatus.
 * @returns {HTMLElement} De kampkaart als DOM-element.
 */
export function renderAdminKampKaart(kamp, dagprogrammas, teamInfo = null) {
  const kaart = document.createElement('div');
  kaart.className = 'kamp-kaart';

  const dagDatums = genereerKampDagen(kamp.startdatum, kamp.einddatum);
  const statusKleur = { concept: 'badge-concept', actief: 'badge-actief', afgelopen: 'badge-afgelopen' }[kamp.status] ?? 'badge-grijs';
  const statusNaam  = { concept: 'Concept', actief: 'Actief', afgelopen: 'Afgelopen' }[kamp.status] ?? kamp.status;
  const openBadge   = kamp.beschikbaarheid_open
    ? `<span class="badge badge-limoen">🔓 Beschikbaarheid open</span>` : '';

  kaart.innerHTML = `
    <div class="kamp-kaart-header">
      <div>
        <div class="kamp-naam">${kamp.naam}</div>
        <div class="kamp-meta">
          📍 ${kamp.locatie} &nbsp;·&nbsp;
          📅 ${datumNaarNL(kamp.startdatum)} – ${datumNaarNL(kamp.einddatum)} &nbsp;·&nbsp;
          ${dagDatums.length} dagen
        </div>
        <div class="flex-gap mt-8">
          <span class="badge badge-limoen">${kamp.leeftijdsgroep ?? ''}</span>
          <span class="badge ${statusKleur}">${statusNaam}</span>
          ${openBadge}
        </div>
      </div>
      <div class="kaart-acties geen-print">
        <button class="knop knop-omtrek knop-klein print-dag-knop" data-kamp="${kamp.id}">
          Afdrukken
        </button>
      </div>
    </div>
    ${teamInfo ? renderTeamStrook(teamInfo) : ''}
    <div class="week-raster" id="week-${kamp.id}">
      ${dagDatums.map(datum => renderDagKolom(datum, dagprogrammas, kamp.id, true)).join('')}
    </div>
  `;
  return kaart;
}

/**
 * Render een uitnodigingskaart (aanvaarden of weigeren).
 *
 * @param {object} koppeling - kamp_lesgevers rij met kampinfo.
 * @returns {string} HTML-string.
 */
export function renderUitnodigingKaart(koppeling) {
  const kamp = koppeling.kampen;
  const dagen = genereerKampDagen(kamp.startdatum, kamp.einddatum);
  return `
    <div class="kaart" style="border-left:4px solid var(--kleur-middengroen);margin-bottom:12px"
         id="uitnodiging-${koppeling.id}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
        <div>
          <div class="vet" style="font-size:1rem">${kamp.naam}</div>
          <div class="kamp-meta mt-8">
            📍 ${kamp.locatie} &nbsp;·&nbsp;
            📅 ${datumNaarNL(kamp.startdatum)} – ${datumNaarNL(kamp.einddatum)}
            &nbsp;·&nbsp; ${dagen.length} dagen
          </div>
          <div class="mt-8 flex-gap">
            <span class="badge badge-limoen">${kamp.leeftijdsgroep}</span>
            <span class="badge badge-geel">⏳ Uitnodiging ontvangen</span>
          </div>
          <div class="font-klein kleur-grijs mt-8">
            Gevraagd op ${formateerDatum(koppeling.gevraagd_op)}
          </div>
        </div>
        <div class="flex-gap" style="flex-wrap:wrap">
          <button class="knop knop-accent"
                  onclick="window._aanvaardUitnodiging('${koppeling.id}','${kamp.naam.replace(/'/g,"\\'")}')">
            ✓ Aanvaarden
          </button>
          <button class="knop knop-omtrek"
                  onclick="window._weigerUitnodiging('${koppeling.id}','${kamp.naam.replace(/'/g,"\\'")}')">
            ✕ Weigeren
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render een bevestigde kampkaart met weekoverzicht.
 *
 * @param {object} koppeling - kamp_lesgevers rij met kampinfo.
 * @param {object[]} dagprogrammas
 * @param {object|null} beschikbaarheid
 * @param {boolean} isBeheerder - Admin/coördinator: toont bewerkopties.
 * @param {boolean} isEigenPlanning - Of dit de eigen planning is (bepaalt annuleer-knop).
 * @returns {HTMLElement}
 */
export function renderBevestigdKampKaart(koppeling, dagprogrammas, beschikbaarheid, isBeheerder = false, isEigenPlanning = true) {
  const kamp = koppeling.kampen;
  const kaart = document.createElement('div');
  kaart.className = 'kamp-kaart';

  const dagDatums = genereerKampDagen(kamp.startdatum, kamp.einddatum);
  const beschBadge = beschikbaarheid
    ? `<span class="badge badge-groen">✓ Beschikbaarheid ingediend</span>` : '';

  const acties = isEigenPlanning
    ? `<button class="knop knop-omtrek knop-klein print-dag-knop" data-kamp="${kamp.id}">Afdrukken</button>
       <button class="knop knop-gevaar knop-klein"
               onclick="window._annuleerKoppeling('${koppeling.id}','${kamp.naam.replace(/'/g,"\\'")}')">
         Annuleren
       </button>`
    : `<button class="knop knop-omtrek knop-klein print-dag-knop" data-kamp="${kamp.id}">Afdrukken</button>`;

  kaart.innerHTML = `
    <div class="kamp-kaart-header">
      <div>
        <div class="kamp-naam">${kamp.naam}</div>
        <div class="kamp-meta">
          📍 ${kamp.locatie} &nbsp;·&nbsp;
          📅 ${datumNaarNL(kamp.startdatum)} – ${datumNaarNL(kamp.einddatum)} &nbsp;·&nbsp;
          ${dagDatums.length} dagen
        </div>
        <div class="flex-gap mt-8">
          <span class="badge badge-limoen">${kamp.leeftijdsgroep}</span>
          <span class="badge badge-goedgekeurd">✓ Bevestigd</span>
          ${beschBadge}
        </div>
      </div>
      <div class="kaart-acties geen-print" style="flex-wrap:wrap">${acties}</div>
    </div>
    <div class="week-raster" id="week-${kamp.id}">
      ${dagDatums.map(datum => renderDagKolom(datum, dagprogrammas, kamp.id, isBeheerder)).join('')}
    </div>
  `;
  return kaart;
}

/**
 * Render één dag-kolom in het weekoverzicht.
 *
 * @param {string} datum
 * @param {object[]} dagprogrammas
 * @param {string} kampID
 * @param {boolean} isBeheerder - Als true: toon bewerkopties (+ en ×).
 */
function renderDagKolom(datum, dagprogrammas, kampID = '', isBeheerder = false) {
  const dagProg = dagprogrammas.find(d => d.datum === datum);
  const fiches  = dagProg?.fiches ?? [];
  const dagprogID = dagProg?.id ?? null;
  const vandaag = datum === lokaleISO(new Date());

  const verwijderKnop = (df) => isBeheerder
    ? `<button class="dagfiche-verwijder-knop" title="Verwijderen"
               onclick="event.stopPropagation();window._verwijderDagfiche('${df.id}','${kampID}','${datum}')">×</button>`
    : '';

  const fichesHTML = fiches.length > 0
    ? fiches.map(f => `
        <div class="dag-fiche-item" data-fiche="${f.fiche_id ?? f.id}" style="position:relative">
          ${verwijderKnop(f)}
          <div class="fiche-naam">${f.naam}</div>
          <div class="fiche-duur">
            ${f.tijdstip ? f.tijdstip.slice(0,5) + ' · ' : ''}${f.duur_minuten ?? '?'} min
          </div>
        </div>
      `).join('')
    : '<div style="font-size:0.75rem;color:#9CA3AF;padding:4px 0">Geen activiteiten</div>';

  const toevoegenKnop = isBeheerder ? `
    <button class="dag-fiche-toevoegen-knop geen-print" title="Fiche toevoegen"
            onclick="window._voegFicheToeAanDag('${kampID}','${datum}','${dagprogID}')">
      + fiche
    </button>` : '';

  return `
    <div class="dag-kolom ${vandaag ? 'dag-kolom-vandaag' : ''}">
      <div class="dag-kolom-header">
        <span>${dagNaam(datum)}</span>
        <span style="font-size:0.7rem;font-weight:400">${datumNaarNL(datum, true)}</span>
      </div>
      ${fichesHTML}
      ${toevoegenKnop}
    </div>
  `;
}

// ── Print ───────────────────────────────────────────────────────────

/**
 * Print het dagprogramma van een dag in een nieuw venster.
 */
export function printDagprogramma(kampNaam, datum, fiches) {
  const venster = window.open('', '_blank');
  const inhoud  = fiches.map((f, i) => `
    <div style="margin-bottom:16px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;page-break-inside:avoid">
      <strong>${i + 1}. ${f.naam}</strong>
      ${f.tijdstip ? `<span style="margin-left:12px;color:#6b7280">${f.tijdstip.slice(0,5)}</span>` : ''}
      <br><small style="color:#6b7280">${f.categorie ?? ''} · ${f.duur_minuten ?? '?'} min</small>
      ${f.notitie ? `<p style="margin-top:6px;font-size:0.85rem">${f.notitie}</p>` : ''}
    </div>`).join('');
  venster.document.write(`<!DOCTYPE html><html lang="nl"><head>
    <meta charset="UTF-8"><title>Dagprogramma</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;color:#194338}h1{font-size:1.4rem}h2{color:#6b7280;font-weight:400}</style>
    </head><body><h1>Dagprogramma — ${kampNaam}</h1><h2>${datumNaarNL(datum)}</h2>
    ${inhoud}<script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
  venster.document.close();
}

// ── Hulpfuncties ────────────────────────────────────────────────────

/**
 * Genereer array van datums (JJJJ-MM-DD) tussen start en eind.
 * Gebruikt lokaleISO() om tijdzonefouten te vermijden — anders
 * zou 1 juli 00:00 lokaal als 30 juni 22:00 UTC weergegeven worden.
 */
export function genereerKampDagen(start, eind) {
  const dagen = [];
  const huidig = new Date(start + 'T00:00:00');
  const eindeD = new Date(eind  + 'T00:00:00');
  while (huidig <= eindeD) {
    dagen.push(lokaleISO(huidig));
    huidig.setDate(huidig.getDate() + 1);
  }
  return dagen;
}

/**
 * Stuur een notificatie naar alle admins/coördinatoren van een kamp.
 * Intern hulpfunctie — haalt kampverantwoordelijke op en stuurt notificatie.
 */
async function stuurAdminNotificatie(koppelingID, type, bericht, link) {
  try {
    // Haal de kampverantwoordelijke op
    const { data: kl } = await supabase
      .from('kamp_lesgevers')
      .select('kamp_id')
      .eq('id', koppelingID)
      .single();

    if (!kl) return;

    const { data: kamp } = await supabase
      .from('kampen')
      .select('verantwoordelijke')
      .eq('id', kl.kamp_id)
      .single();

    if (kamp?.verantwoordelijke) {
      await maakNotificatie(kamp.verantwoordelijke, type, bericht, link);
    }

    // Ook alle andere admins/coördinatoren notificeren
    const { data: beheerders } = await supabase
      .from('profielen')
      .select('id')
      .in('rol', ['admin', 'coordinator'])
      .eq('actief', true)
      .neq('id', kamp?.verantwoordelijke ?? '');

    await Promise.all(
      (beheerders ?? []).map(b => maakNotificatie(b.id, type, bericht, link))
    );
  } catch (fout) {
    console.warn('[planner] Fout bij sturen admin notificatie:', fout.message);
  }
}

/**
 * Stuur een e-mailnotificatie via een Supabase Edge Function.
 * Faalt stilletjes als de Edge Function niet geconfigureerd is.
 *
 * @param {object} gegevens - Type, naam, kampnaam, optioneel reden.
 */
async function stuurEmailNotificatie(gegevens) {
  try {
    await supabase.functions.invoke('stuur-email-notificatie', {
      body: gegevens,
    });
  } catch {
    // Edge Function nog niet ingesteld — portaalnotificatie is de fallback
  }
}

// ── Bevestigde koppelingen (alias voor lesgever-view) ───────────────────

/**
 * Haal de bevestigde koppelingen op voor een lesgever.
 * Alias voor haalBevestigdeKampenOp — retourneert koppelingen met kampinfo.
 *
 * @param {string} lesgeverID
 * @returns {Promise<object[]>}
 */
export async function haalBevestigdeKoppelingenOp(lesgeverID) {
  return haalBevestigdeKampenOp(lesgeverID);
}

// ── Kampgroepen ────────────────────────────────────────────────────────

/**
 * Haal de groepsdefinities op voor een kamp (bv. "Groep A", "Groep B").
 * Groepen bepalen de kolom-indeling in de dag-planning.
 *
 * @param {string} kampID
 * @returns {Promise<object[]>} Gesorteerde lijst van groepen.
 */
export async function haalKampGroepenOp(kampID) {
  try {
    const { data, error } = await supabase
      .from('kamp_groepen').select('*').eq('kamp_id', kampID).order('groep_index');
    if (error) throw error;
    return data ?? [];
  } catch (fout) {
    console.error('[planner] haalKampGroepenOp:', fout.message);
    return [];
  }
}

/**
 * Vervang de volledige groepsdefinitie voor een kamp.
 * Verwijdert eerst alle bestaande groepen en plaatst ze opnieuw —
 * volgorde en namen worden zo altijd correct gesynchroniseerd.
 *
 * @param {string} kampID
 * @param {Array<{groep_index: number, naam: string}>} groepen
 * @returns {Promise<boolean>}
 */
export async function slaKampGroepenOp(kampID, groepen) {
  try {
    await supabase.from('kamp_groepen').delete().eq('kamp_id', kampID);
    if (!groepen.length) return true;
    const { error } = await supabase.from('kamp_groepen').insert(
      groepen.map(g => ({ kamp_id: kampID, groep_index: g.groep_index, naam: g.naam }))
    );
    if (error) throw error;
    return true;
  } catch (fout) {
    console.error('[planner] slaKampGroepenOp:', fout.message);
    toonToast('Kon groepen niet opslaan.', 'fout');
    return false;
  }
}

// ── Dag blokken ──────────────────────────────────────────────────────────

/**
 * Haal alle dag-blokken op voor één dag van een kamp (gesorteerd op starttijd).
 * Inclusief de gekoppelde activiteitenfiche per blok.
 *
 * @param {string} kampID
 * @param {string} datum - ISO datumstring (JJJJ-MM-DD).
 * @returns {Promise<object[]>} Gesorteerde blokken.
 */
export async function haalDagBlokkenOp(kampID, datum) {
  try {
    const { data, error } = await supabase
      .from('dag_blokken')
      .select('*, activiteiten_fiches(id, naam, categorie, duur_minuten)')
      .eq('kamp_id', kampID).eq('datum', datum).order('start_tijd');
    if (error) throw error;
    return data ?? [];
  } catch (fout) {
    console.error('[planner] haalDagBlokkenOp:', fout.message);
    return [];
  }
}

/**
 * Sla een dag-blok op (nieuw aanmaken of bijwerken).
 *
 * @param {object} blokData - Blok-velden (kamp_id, datum, type, start_tijd, eind_tijd, …).
 * @param {string|null} blokID - UUID bij bijwerken, null bij aanmaken.
 * @returns {Promise<boolean>}
 */
export async function slaBlokOp(blokData, blokID = null) {
  try {
    if (blokID) {
      const { error } = await supabase.from('dag_blokken').update(blokData).eq('id', blokID);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('dag_blokken').insert(blokData);
      if (error) throw error;
    }
    return true;
  } catch (fout) {
    console.error('[planner] slaBlokOp:', fout.message);
    toonToast('Kon blok niet opslaan.', 'fout');
    return false;
  }
}

/**
 * Verwijder een dag-blok. Vaste blokken (vooropvang, naopvang, middagpauze)
 * kunnen niet verwijderd worden — daarvoor moet het tijdslot aangepast worden.
 *
 * @param {string} blokID - UUID van het dag-blok.
 * @returns {Promise<boolean>}
 */
export async function verwijderBlok(blokID) {
  try {
    // Defensieve check: vaste blokken (vooropvang/naopvang/middagpauze)
    // mogen niet verwijderd worden — die worden altijd automatisch aangemaakt.
    const { data: blok } = await supabase
      .from('dag_blokken')
      .select('type')
      .eq('id', blokID)
      .maybeSingle();
    if (blok && ['vooropvang', 'naopvang', 'middagpauze'].includes(blok.type)) {
      console.warn('[planner] Vast blok kan niet verwijderd worden:', blok.type);
      toonToast(`Een ${blok.type}-blok kan niet verwijderd worden. Je kan wel het tijdslot aanpassen.`, 'fout');
      return false;
    }

    const { error } = await supabase.from('dag_blokken').delete().eq('id', blokID);
    if (error) throw error;
    return true;
  } catch (fout) {
    console.error('[planner] verwijderBlok:', fout.message);
    return false;
  }
}

/**
 * Zorg dat een dag zijn standaardblokken heeft.
 * Maakt de vaste structuur aan (vooropvang 8–9u, 3×activiteit, 2×pauze,
 * middagpauze, naopvang 16–17u) als die nog niet bestaat.
 * Bevat ook migratie-logica voor verouderde per-groep pauzeblokken.
 *
 * @param {string} kampID
 * @param {string} datum - ISO datumstring.
 * @param {object[]} groepen - Huidig actieve groepen (leeg array = één gedeelde groep).
 * @returns {Promise<object[]>} De actuele blokken na initialisatie.
 */
export async function initialiseerDagPlanning(kampID, datum, groepen) {
  const bestaand = await haalDagBlokkenOp(kampID, datum);

  // ── Opruimen: verwijder per-groep blokken als er geen (echte) groepen meer zijn ──
  // Dit lost dubbelingen op na het verwijderen van alle groepen.
  const heeftGeenGroepen = !Array.isArray(groepen) || groepen.length === 0;
  const perGroepBlokken  = bestaand.filter(b => b.groep_index >= 0);
  if (heeftGeenGroepen && perGroepBlokken.length > 0) {
    try {
      await supabase.from('dag_blokken').delete()
        .eq('kamp_id', kampID).eq('datum', datum)
        .gte('groep_index', 0);
    } catch (e) { console.error('[planner] opruimen per-groep blokken:', e?.message); }
  }

  // ── Migratie: verwijder verouderde per-groep pauze/middagpauzeblokken ──
  // (Oud schema had pauzes per groep; nieuw schema gebruikt enkel gedeelde pauzes)
  const oudePerGroepPauzes = bestaand.filter(b => b.groep_index >= 0 && ['pauze', 'middagpauze'].includes(b.type));
  if (oudePerGroepPauzes.length > 0) {
    try {
      await supabase.from('dag_blokken').delete()
        .eq('kamp_id', kampID).eq('datum', datum)
        .gte('groep_index', 0).in('type', ['pauze', 'middagpauze']);
    } catch (e) { console.error('[planner] migratie delete pauze:', e?.message); }
  }

  // Haal opnieuw op (na eventuele migratiedelete) en bepaal welke gedeelde blokken er al zijn
  const huidig  = oudePerGroepPauzes.length > 0 ? await haalDagBlokkenOp(kampID, datum) : bestaand;
  const gedeeld = huidig.filter(b => b.groep_index === -1);
  const heeftType   = (t) => gedeeld.some(b => b.type === t);
  const heeftStart  = (s) => gedeeld.some(b => b.type === 'activiteit' && b.start_tijd.slice(0,5) === s);
  const heeftGPauze = (s) => gedeeld.some(b => b.type === 'pauze'      && b.start_tijd.slice(0,5) === s);

  // Standaardblokken die ontbreken worden bijgevoegd
  const teAanmaken = [];
  if (!heeftType('vooropvang'))   teAanmaken.push({ kamp_id: kampID, datum, groep_index: -1, type: 'vooropvang',  start_tijd: '08:00', eind_tijd: '09:00', label: 'Vooropvang',  lesgevers: [] });
  if (!heeftStart('09:00'))       teAanmaken.push({ kamp_id: kampID, datum, groep_index: -1, type: 'activiteit',  start_tijd: '09:00', eind_tijd: '10:30', label: null,           lesgevers: [] });
  if (!heeftGPauze('10:30'))      teAanmaken.push({ kamp_id: kampID, datum, groep_index: -1, type: 'pauze',       start_tijd: '10:30', eind_tijd: '11:00', label: 'Pauze',        lesgevers: [] });
  if (!heeftStart('11:00'))       teAanmaken.push({ kamp_id: kampID, datum, groep_index: -1, type: 'activiteit',  start_tijd: '11:00', eind_tijd: '12:15', label: null,           lesgevers: [] });
  if (!heeftType('middagpauze'))  teAanmaken.push({ kamp_id: kampID, datum, groep_index: -1, type: 'middagpauze', start_tijd: '12:15', eind_tijd: '13:15', label: 'Middagpauze',  lesgevers: [] });
  if (!heeftStart('13:15'))       teAanmaken.push({ kamp_id: kampID, datum, groep_index: -1, type: 'activiteit',  start_tijd: '13:15', eind_tijd: '14:30', label: null,           lesgevers: [] });
  if (!heeftGPauze('14:30'))      teAanmaken.push({ kamp_id: kampID, datum, groep_index: -1, type: 'pauze',       start_tijd: '14:30', eind_tijd: '14:45', label: 'Pauze',        lesgevers: [] });
  if (!heeftStart('14:45'))       teAanmaken.push({ kamp_id: kampID, datum, groep_index: -1, type: 'activiteit',  start_tijd: '14:45', eind_tijd: '16:00', label: null,           lesgevers: [] });
  if (!heeftType('naopvang'))     teAanmaken.push({ kamp_id: kampID, datum, groep_index: -1, type: 'naopvang',    start_tijd: '16:00', eind_tijd: '17:00', label: 'Naopvang',     lesgevers: [] });

  if (teAanmaken.length > 0) {
    try { await supabase.from('dag_blokken').insert(teAanmaken); } catch (e) { console.error('[planner] initialiseerDagPlanning insert:', e?.message); }
    return await haalDagBlokkenOp(kampID, datum);
  }

  return huidig;
}

// ── Timeline rendering ───────────────────────────────────────────────────

const PLAN_START = 9;  // 9u — kernactiviteiten beginnen
const PLAN_EIND  = 16; // 16u — kernactiviteiten eindigen
const TOTAAL_MIN = (PLAN_EIND - PLAN_START) * 60; // 420 minuten (7u)

// Vaste schaalverhouding: 1.4px per minuut → 9u–16u = 588px hoogte.
// Dit geeft een overzichtelijke, goed leesbare tijdlijn zonder scrollproblemen.
// De container krijgt overflow-y: auto als de pagina toch te klein is.
const PX_MIN = 1.4;

/**
 * Converteer een tijdstring (HH:MM) naar een y-positie in pixels
 * ten opzichte van de tijdas (start = PLAN_START uur = 0px).
 *
 * @param {string} tijd - Bijv. "09:30"
 * @returns {number} Pixels vanaf de bovenkant van de tijdas.
 */
export function tijdNaarPx(tijd) {
  const [h, m] = (tijd ?? '08:00').slice(0, 5).split(':').map(Number);
  return ((h - PLAN_START) * 60 + m) * PX_MIN;
}

/**
 * Converteer een y-positie in pixels terug naar een tijdstring (HH:MM).
 * Rondt af op 15 minuten voor snap-to-grid gedrag bij drag & drop.
 *
 * @param {number} px
 * @returns {string} Bijv. "10:15"
 */
export function pxNaarTijd(px) {
  const min = Math.round(px / PX_MIN / 15) * 15;
  const totalMin = PLAN_START * 60 + min;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
}

/**
 * Bereken de hoogte in pixels voor een blok op basis van start- en eindtijd.
 * Minimumhoogte van 16px zodat korte blokken leesbaar blijven.
 *
 * @param {string} start - Bijv. "09:00"
 * @param {string} eind  - Bijv. "10:30"
 * @returns {number} Hoogte in pixels.
 */
export function duurNaarPx(start, eind) {
  const [hs, ms] = (start ?? '08:00').slice(0,5).split(':').map(Number);
  const [he, me] = (eind  ?? '09:00').slice(0,5).split(':').map(Number);
  // Minimum 16px (was 22) zodat compacte blokken niet domineren
  return Math.max(((he - hs) * 60 + (me - ms)) * PX_MIN, 16);
}

/**
 * Render de dagplanning als verticale schemalijst.
 * Blokken worden gesorteerd op starttijd en per type weergegeven:
 *  - vooropvang / naopvang : vast, lesgever toewijzen
 *  - activiteit            : fiche koppelen, tijden aanpasbaar, per-groep toggle
 *  - pauze                 : puur informatief
 *  - middagpauze           : tijden aanpasbaar
 */
export function renderPlanningTimeline(kampID, datum, blokken, echteGroepen, isEditeerbaar, gekoppeldeLesgevers = []) {
  blokken      = Array.isArray(blokken) ? blokken : [];
  echteGroepen = Array.isArray(echteGroepen) ? echteGroepen : [];

  // Sorteer op starttijd
  const gesorteerd = [...blokken].sort((a, b) => a.start_tijd.localeCompare(b.start_tijd));

  // Groepeer in slots: gedeeld (groep_index=-1) of per-groep (groep_index>=0)
  const slots        = [];
  const gezien       = new Set();
  const slotsGezien  = new Set(); // sleutel = starttijd-type

  if (echteGroepen.length <= 1) {
    // ── Eenvoudige modus (0 of 1 groep) ─────────────────────────────
    // Toon exact één rij per tijdslot, ongeacht of het blok gedeeld of per-groep is.
    // Voorkom dubbelingen veroorzaakt door overlappende gedeelde én per-groep blokken.
    for (const blok of gesorteerd) {
      if (gezien.has(blok.id)) continue;
      gezien.add(blok.id);
      const sleutel = `${blok.start_tijd.slice(0, 5)}-${blok.type}`;
      if (slotsGezien.has(sleutel)) continue; // dit tijdslot is al vertegenwoordigd
      slotsGezien.add(sleutel);
      slots.push({ isPerGroep: false, blok }); // altijd eenvoudige weergave
    }
  } else {
    // ── Groepenmodus (2+ groepen) ────────────────────────────────────
    // Bepaal welke tijd+type combinaties per-groep blokken hebben
    const perGroepSlots = new Set(
      gesorteerd
        .filter(b => b.groep_index >= 0)
        .map(b => `${b.start_tijd.slice(0, 5)}-${b.type}`)
    );
    for (const blok of gesorteerd) {
      if (gezien.has(blok.id)) continue;
      if (blok.groep_index === -1) {
        if (perGroepSlots.has(`${blok.start_tijd.slice(0, 5)}-${blok.type}`)) {
          gezien.add(blok.id);
          continue;
        }
        slots.push({ isPerGroep: false, blok });
        gezien.add(blok.id);
      } else {
        const samen = gesorteerd.filter(b =>
          !gezien.has(b.id) && b.groep_index >= 0 &&
          b.start_tijd === blok.start_tijd && b.type === blok.type
        );
        slots.push({ isPerGroep: true, blokken: samen });
        samen.forEach(b => gezien.add(b.id));
      }
    }
  }

  const ICOON = { vooropvang: '🌅', naopvang: '🌇', middagpauze: '🍽️', pauze: '☕', activiteit: '⚡' };

  function lgNamen(ids) {
    return (ids ?? []).map(id => {
      const lg = gekoppeldeLesgevers.find(l => l.id === id);
      return lg ? `${lg.voornaam} ${lg.achternaam}` : '';
    }).filter(Boolean).join(', ');
  }

  // ── Gedeeld blok (groep_index = -1) ────────────────────────────────
  function renderGedeeldSlot(blok) {
    const icoon         = ICOON[blok.type] ?? '📋';
    const tijdStr       = `${blok.start_tijd.slice(0,5)}–${blok.eind_tijd.slice(0,5)}`;
    const isVast        = ['vooropvang', 'naopvang'].includes(blok.type);
    const isPauze       = blok.type === 'pauze';       // puur informatief, niet klikbaar
    const isMiddagpauze = blok.type === 'middagpauze'; // tijden aanpasbaar
    const isActiviteit  = blok.type === 'activiteit';
    const namen         = lgNamen(blok.lesgevers);
    const fiche         = blok.activiteiten_fiches;

    // Tijdlabel: klikbaar voor activiteit + middagpauze
    const klikbaar = isEditeerbaar && (isActiviteit || isMiddagpauze);
    const tijdKlik = klikbaar
      ? `onclick="window._bewerkPlanBlok('${blok.id}','${kampID}','${datum}')" title="Tijden aanpassen"`
      : '';
    const tijdEl = `<span class="schema-tijd${klikbaar ? ' schema-tijd-bewerkbaar' : ''}" ${tijdKlik}>${icoon} ${tijdStr}</span>`;

    // Blokinhoud
    let inhoud;
    if (isActiviteit) {
      inhoud = fiche
        ? `<div class="schema-fiche-info">
             <span class="schema-fiche-naam">${fiche.naam}</span>
             <span class="schema-fiche-meta">${fiche.categorie ?? ''}${fiche.duur_minuten ? ' · ' + fiche.duur_minuten + ' min' : ''}</span>
           </div>`
        : `<span class="schema-geen-fiche">Geen activiteit gepland</span>`;
    } else if (isVast) {
      inhoud = namen
        ? `<span class="schema-lg">👤 ${namen}</span>`
        : (isEditeerbaar
            ? `<span class="schema-lg leeg">Klik om lesgever toe te wijzen</span>`
            : `<span class="schema-lg leeg">—</span>`);
    } else {
      inhoud = `<span class="schema-pauze-label">${blok.label ?? (isMiddagpauze ? 'Middagpauze' : 'Pauze')}</span>`;
    }

    // Actieknoppen
    let acties = '';
    if (isEditeerbaar) {
      if (isActiviteit) {
        const ficheLabel = fiche ? '✏️ Fiche' : '+ Fiche';
        acties += `<button class="schema-knop schema-fiche-knop"
          onclick="window._koppelFicheAanBlok('${blok.id}','${kampID}','${datum}')"
          title="${fiche ? 'Fiche wijzigen' : 'Activiteit koppelen'}">${ficheLabel}</button>`;
        if (echteGroepen.length > 0) {
          acties += `<button class="schema-knop schema-toggle-knop"
            onclick="window._togglePerGroep('${blok.id}','${kampID}','${datum}')"
            title="Splits per groep">🔀</button>`;
        }
      } else if (isVast) {
        acties += `<button class="schema-knop schema-lg-knop"
          onclick="window._bewerkPlanBlok('${blok.id}','${kampID}','${datum}')">👤 Lesgever</button>`;
      }
    }

    const blokKlik = (isEditeerbaar && isVast)
      ? `onclick="window._bewerkPlanBlok('${blok.id}','${kampID}','${datum}')" style="cursor:pointer"`
      : '';

    return `
      <div class="schema-blok schema-blok-${blok.type}" ${blokKlik}>
        <div class="schema-blok-links">${tijdEl}</div>
        <div class="schema-blok-inhoud">${inhoud}</div>
        ${acties ? `<div class="schema-blok-acties">${acties}</div>` : ''}
      </div>`;
  }

  // ── Per-groep slot (meerdere blokken, één per groep) ───────────────
  function renderPerGroepSlot(slot) {
    const b0 = slot.blokken[0];
    if (!b0) return '';
    const tijdStr = `${b0.start_tijd.slice(0,5)}–${b0.eind_tijd.slice(0,5)}`;

    const rijen = echteGroepen.map(g => {
      const gb = slot.blokken.find(b => b.groep_index === g.groep_index);
      const f  = gb?.activiteiten_fiches;
      return `
        <div class="schema-groep-rij">
          <span class="schema-groep-naam">${g.naam}</span>
          <div class="schema-groep-inhoud">
            ${f
              ? `<span class="schema-fiche-naam">${f.naam}</span>`
              : `<span class="schema-geen-fiche">Geen activiteit</span>`}
          </div>
          ${isEditeerbaar && gb
            ? `<button class="schema-knop schema-fiche-knop klein"
                 onclick="window._koppelFicheAanBlok('${gb.id}','${kampID}','${datum}')">${f ? '✏️' : '+'}</button>`
            : ''}
        </div>`;
    }).join('');

    const tijdKlik = isEditeerbaar
      ? `onclick="window._bewerkPlanBlok('${b0.id}','${kampID}','${datum}')" title="Tijden aanpassen"`
      : '';

    return `
      <div class="schema-blok schema-blok-activiteit schema-blok-per-groep">
        <div class="schema-blok-balk">
          <span class="schema-tijd schema-tijd-bewerkbaar" ${tijdKlik}>⚡ ${tijdStr}</span>
          ${isEditeerbaar ? `
          <button class="schema-knop schema-toggle-knop"
            onclick="window._toggleGedeeld('${kampID}','${datum}','${b0.start_tijd}','${b0.eind_tijd}')"
            title="Terug naar gedeeld">🔀 Gedeeld</button>` : ''}
        </div>
        <div class="schema-groepen-lijst">${rijen}</div>
      </div>`;
  }

  const html = slots.map(s => s.isPerGroep ? renderPerGroepSlot(s) : renderGedeeldSlot(s.blok)).join('');

  return `<div class="plan-schema">${html ||
    '<div style="padding:24px;text-align:center;color:var(--kleur-grijs);font-size:0.85rem">Geen blokken gevonden.</div>'
  }</div>`;
}

/**
 * Render een weekoverzicht: alle dagen naast elkaar.
 *
 * @param {string} kampID
 * @param {string[]} dagen - ISO-datums in chronologische volgorde
 * @param {Map<string, object[]>} blokkenPerDag - map datum → blokken
 * @param {object[]} groepen - groep-definities (voor weergave, geen kolomscheiding)
 * @param {Function} onKlikDag - callback bij klik op dag-kolom (om naar dag-modus te switchen)
 * @returns {string} HTML-string voor de week-tijdlijn
 */
export function renderWeekTimeline(kampID, dagen, blokkenPerDag, groepen, onKlikDag, isEditeerbaar = false, gekoppeldeLesgevers = []) {
  const HOOGTE = TOTAAL_MIN * PX_MIN; // 420 * 1.4 = 588px

  // Tijdlabels (alleen 1x links)
  let tijdlabels = '';
  for (let min = 0; min <= TOTAAL_MIN; min += 30) {
    const h = PLAN_START + Math.floor(min / 60);
    const m = min % 60;
    const isHeel = m === 0;
    tijdlabels += `
      <div class="plan-tijdlabel ${isHeel ? 'heel' : 'half'}" style="top:${min * PX_MIN}px">${h}:${m.toString().padStart(2,'0')}</div>
      <div class="plan-raster-lijn ${isHeel ? 'heel' : 'half'}" style="top:${min * PX_MIN}px"></div>`;
  }

  // Vaste rij-hoogtes zodat alles netjes uitlijnt
  const HEADER_H = 38;
  const RAND_H = 48;

  const dagKolommen = dagen.map(d => {
    const dagBlokken = blokkenPerDag.get(d) ?? [];
    const dateObj = new Date(d + 'T00:00:00');
    const weekdag = dateObj.toLocaleDateString('nl-BE', { weekday: 'short' });
    const datumLabel = dateObj.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
    const isVandaag  = d === lokaleISO(new Date());

    // Splits vooropvang/naopvang uit (komen apart bovenaan/onderaan de kolom)
    const vooropvang = dagBlokken.filter(b => b.type === 'vooropvang');
    const naopvang   = dagBlokken.filter(b => b.type === 'naopvang');
    const middenBlokken = dagBlokken.filter(b => !['vooropvang','naopvang'].includes(b.type));

    // Mini-randblok voor week-modus: 2-regel layout (naam+tijd / lesgever-info)
    const renderMiniRand = (b, pos) => {
      const lgNamen = (b.lesgevers ?? [])
        .map(id => gekoppeldeLesgevers.find(l => l.id === id)?.voornaam)
        .filter(Boolean).join(', ');
      const lgTekst = lgNamen || `Klik om lesgever toe te wijzen`;
      const lgClass = lgNamen ? 'lg' : 'lg leeg';
      return `
      <div class="week-randblok week-randblok-${pos}"
           onclick="event.stopPropagation();window._bewerkPlanBlok('${b.id}','${kampID}','${d}')"
           title="${b.label ?? b.type} · ${b.start_tijd.slice(0,5)}–${b.eind_tijd.slice(0,5)}">
        <div class="week-randblok-rij1">
          <span class="naam">${b.label ?? b.type}</span>
          <span class="tijd">${b.start_tijd.slice(0,5)}–${b.eind_tijd.slice(0,5)}</span>
        </div>
        <div class="${lgClass}">${lgTekst}</div>
      </div>`;
    };

    // Render midden-blokken in de tijdas (inhoud)
    const blokkenHTML = middenBlokken.map(blok => {
      const top = tijdNaarPx(blok.start_tijd);
      const hoog = duurNaarPx(blok.start_tijd, blok.eind_tijd);
      const naam = blok.activiteiten_fiches?.naam ?? blok.label ?? (blok.type === 'activiteit' ? null : blok.type);
      const kleur = { middagpauze:'middagpauze', pauze:'pauze', activiteit:'activiteit' }[blok.type] ?? 'activiteit';
      const isKort = hoog < 24;
      const lgNamen = (blok.lesgevers ?? []).map(id => '👤').slice(0, 3).join(' ');
      return `
        <div class="plan-blok plan-blok-${kleur}${isKort ? ' kort' : ''}"
             style="top:${top}px;height:${hoog}px"
             title="${naam ?? '—'} · ${blok.start_tijd.slice(0,5)}–${blok.eind_tijd.slice(0,5)}">
          <div class="plan-blok-naam${!naam ? ' geen-fiche' : ''}">${naam ?? '—'}</div>
          ${!isKort ? `<div class="plan-blok-tijd">${blok.start_tijd.slice(0,5)}–${blok.eind_tijd.slice(0,5)}</div>` : ''}
          ${lgNamen && !isKort ? `<div class="plan-blok-lg">${lgNamen}</div>` : ''}
        </div>`;
    }).join('');

    // Leeg slot ziet er identiek uit als een gevuld blok maar met standaardtijden
    const renderLeegRand = (pos, type, defaultTijd) => `
      <div class="week-randblok week-randblok-${pos} week-randblok-leeg-slot"
           onclick="event.stopPropagation();window._voegRandblokToe('${kampID}','${d}','${type}')"
           title="${type === 'vooropvang' ? 'Vooropvang' : 'Naopvang'} instellen">
        <div class="week-randblok-rij1">
          <span class="naam">${type === 'vooropvang' ? 'Vooropvang' : 'Naopvang'}</span>
          <span class="tijd">${defaultTijd}</span>
        </div>
        <div class="lg leeg">Klik om lesgever toe te wijzen</div>
      </div>`;

    const vooropvangSlot = vooropvang.length > 0
      ? vooropvang.map(b => renderMiniRand(b, 'voor')).join('')
      : renderLeegRand('voor', 'vooropvang', '08:00–09:00');

    const naopvangSlot = naopvang.length > 0
      ? naopvang.map(b => renderMiniRand(b, 'na')).join('')
      : renderLeegRand('na', 'naopvang', '16:00–17:00');

    return `
      <div class="week-dag-kol ${isVandaag ? 'vandaag' : ''}">
        <div class="week-dag-header" style="height:${HEADER_H}px"
             onclick="${onKlikDag}('${kampID}','${d}')" title="Klik om in dag-modus te bewerken">
          <div class="week-dag-weekdag">${weekdag}</div>
          <div class="week-dag-datum">${datumLabel}</div>
        </div>
        <div class="week-rand-cel" style="height:${RAND_H}px">${vooropvangSlot}</div>
        <div class="week-dag-inhoud" style="height:${HOOGTE}px;position:relative">
          ${blokkenHTML}
        </div>
        <div class="week-rand-cel" style="height:${RAND_H}px">${naopvangSlot}</div>
        ${isEditeerbaar ? `
        <div class="week-toevoeg-rij">
          <button class="plan-toevoegen-knop"
                  onclick="event.stopPropagation();window._voegActiviteitToe('${kampID}','${d}',${groepen.length > 0 ? groepen[0].groep_index : -1})">
            + Activiteit
          </button>
        </div>` : ''}
      </div>`;
  }).join('');

  // Tijdas-kolom: spacers voor header en randblokken, dan de tijdlabels op exact dezelfde y
  return `
    <div class="plan-wrapper week-modus">
      <div class="week-tijdas-kol">
        <div class="week-tijdas-spacer" style="height:${HEADER_H}px"></div>
        <div class="week-tijdas-randspacer" style="height:${RAND_H}px">
          <span>🌅</span>
        </div>
        <div class="plan-tijdas" style="height:${HOOGTE}px;width:44px">
          ${tijdlabels}
        </div>
        <div class="week-tijdas-randspacer" style="height:${RAND_H}px">
          <span>🌇</span>
        </div>
      </div>
      <div class="week-kolommen-wrap">
        ${dagKolommen}
      </div>
    </div>`;
}
