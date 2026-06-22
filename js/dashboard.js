/**
 * dashboard.js — Startpagina na inloggen
 *
 * Toont een persoonlijk overzicht: aankomende kampen, openstaande
 * uitnodigingen, te ondertekenen contracten en notificaties.
 * Admins/coördinatoren krijgen ook beheersstatistieken.
 *
 * @module dashboard
 */

import { supabase } from './supabase.js?v=1780304789425';
import { toonToast, datumNaarNL, ontsnap, lokaleISO, genereerICalBestand, downloadBestand } from './utils.js?v=1780304789425';

const V = '?v=1780304789425';

// ── Publieke initialisatie ────────────────────────────────────────────

export async function initialiseerDashboard(profiel) {
  const isBeheerder = profiel.rol === 'admin' || profiel.rol === 'coordinator';

  // Laad alle secties parallel
  const [uitnodigingen, bevestigdeKampen, contracten] = await Promise.all([
    haalUitnodigingenOp(profiel.id),
    haalBevestigdeKampenOp(profiel.id),
    haalTeOndertekenenContractenOp(profiel.id),
  ]);

  renderWelkomSectie(profiel);
  renderSnelleActies(uitnodigingen, contracten, isBeheerder);
  renderAankomendeKampen(bevestigdeKampen, isBeheerder);
  renderUitnodigingenSectie(uitnodigingen);

  if (!isBeheerder) {
    const ontbrekendeKampen = await haalKampenZonderBeschikbaarheidOp(profiel.id);
    renderBeschikbaarheidReminder(ontbrekendeKampen);
  }

  if (isBeheerder) {
    const [stats, ficheVoorstellen] = await Promise.all([
      haalBeheerStatsOp(),
      haalFicheVoorstellenOp(),
    ]);
    renderBeheerStats(stats);
    renderFicheVoorstellenSectie(ficheVoorstellen);
    document.getElementById('beheer-sectie')?.classList.remove('verborgen');
  }

  // iCal export knop
  const icalKnop = document.getElementById('ical-export-knop');
  if (icalKnop && bevestigdeKampen.length > 0) {
    icalKnop.classList.remove('verborgen');
    icalKnop.addEventListener('click', () => {
      const kampen = bevestigdeKampen
        .map(k => k.kampen)
        .filter(k => k && k.startdatum)
        .filter(k => k.einddatum >= lokaleISO(new Date()));
      if (kampen.length === 0) { toonToast('Geen aankomende kampen om te exporteren.', 'info'); return; }
      const inhoud = genereerICalBestand(kampen, 'Mijn SportFun kampen');
      downloadBestand(inhoud, 'sportfun-kampen.ics', 'text/calendar;charset=utf-8');
      toonToast(`${kampen.length} kamp(en) geëxporteerd naar agenda.`, 'succes');
    });
  }
}

// ── Data ophalen ──────────────────────────────────────────────────────

async function haalUitnodigingenOp(lesgeverID) {
  const vandaag = lokaleISO(new Date());
  const { data, error } = await supabase
    .from('kamp_lesgevers')
    .select(`id, status, gevraagd_op, kampen(id, naam, locatie, startdatum, einddatum, leeftijdsgroep)`)
    .eq('lesgever_id', lesgeverID)
    .eq('status', 'gevraagd')
    .gte('kampen.einddatum', vandaag);
  if (error) { console.error('[dashboard] uitnodigingen:', error.message); return []; }
  // PostgREST filtert niet op kolommen van embedded tabellen via .gte() op de parent —
  // extra client-side datumfilter is verplicht.
  return (data ?? []).filter(k => k.kampen && k.kampen.einddatum >= vandaag);
}

async function haalBevestigdeKampenOp(lesgeverID) {
  const vandaag = lokaleISO(new Date());
  const { data, error } = await supabase
    .from('kamp_lesgevers')
    .select(`id, kampen(id, naam, locatie, startdatum, einddatum, leeftijdsgroep, status)`)
    .eq('lesgever_id', lesgeverID)
    .eq('status', 'bevestigd')
    .gte('kampen.einddatum', vandaag)
    .order('kampen(startdatum)', { ascending: true });
  if (error) { console.error('[dashboard] bevestigde kampen:', error.message); return []; }
  // Client-side datumfilter: .gte() op embedded kolommen wordt genegeerd door PostgREST
  return (data ?? [])
    .filter(k => k.kampen && k.kampen.einddatum >= vandaag)
    .sort((a, b) => (a.kampen.startdatum ?? '').localeCompare(b.kampen.startdatum ?? ''));
}

async function haalTeOndertekenenContractenOp(lesgeverID) {
  const { data, error } = await supabase
    .from('contracten')
    .select(`id, ondertekend, kampen(naam, startdatum)`)
    .eq('lesgever_id', lesgeverID)
    .eq('ondertekend', false);
  if (error) { console.error('[dashboard] contracten:', error.message); return []; }
  return data ?? [];
}

async function haalBeheerStatsOp() {
  const vandaag = lokaleISO(new Date());
  const [kampenRes, lesgeversRes, openContractenRes] = await Promise.all([
    supabase.from('kampen').select('id, status', { count: 'exact' }),
    supabase.from('profielen').select('id', { count: 'exact' }).in('rol', ['lesgever', 'extra_hulp']).eq('actief', true),
    supabase.from('contracten').select('id', { count: 'exact' }).eq('ondertekend', false),
  ]);
  return {
    actieveKampen:    (kampenRes.data ?? []).filter(k => k.status === 'actief').length,
    conceptKampen:    (kampenRes.data ?? []).filter(k => k.status === 'concept').length,
    aantalLesgevers:  lesgeversRes.count ?? 0,
    openContracten:   openContractenRes.count ?? 0,
  };
}

async function haalFicheVoorstellenOp() {
  const { data, error } = await supabase
    .from('activiteiten_fiches')
    .select(`id, naam, aangemaakt_op, profielen!aangemaakt_door(voornaam, achternaam)`)
    .eq('status', 'voorstel')
    .order('aangemaakt_op', { ascending: false })
    .limit(5);
  if (error) { console.error('[dashboard] fiche voorstellen:', error.message); return []; }
  return data ?? [];
}

// ── Renderen ──────────────────────────────────────────────────────────

function renderWelkomSectie(profiel) {
  const el = document.getElementById('welkom-naam');
  if (el) el.textContent = profiel.voornaam;
}

function renderSnelleActies(uitnodigingen, contracten, isBeheerder) {
  const container = document.getElementById('snelle-acties');
  if (!container) return;

  const pills = [];

  if (uitnodigingen.length > 0) {
    pills.push(`
      <a href="planner.html" class="dash-actie-pil dash-actie-oranje">
        <span class="dash-actie-getal">${uitnodigingen.length}</span>
        <span>${uitnodigingen.length === 1 ? 'uitnodiging' : 'uitnodigingen'} wacht op antwoord</span>
        <span class="dash-actie-pijl">→</span>
      </a>`);
  }

  if (contracten.length > 0) {
    pills.push(`
      <a href="profiel.html" class="dash-actie-pil dash-actie-blauw">
        <span class="dash-actie-getal">${contracten.length}</span>
        <span>${contracten.length === 1 ? 'contract' : 'contracten'} te ondertekenen</span>
        <span class="dash-actie-pijl">→</span>
      </a>`);
  }

  if (isBeheerder) {
    pills.push(`
      <a href="admin.html" class="dash-actie-pil dash-actie-groen">
        <span>Naar beheer</span>
        <span class="dash-actie-pijl">→</span>
      </a>`);
  }

  container.innerHTML = pills.length > 0
    ? pills.join('')
    : `<p style="color:var(--kleur-grijs);font-size:0.9rem">Alles in orde — geen openstaande acties.</p>`;
}

function renderAankomendeKampen(bevestigdeKampen, isBeheerder) {
  const container = document.getElementById('aankomende-kampen-lijst');
  if (!container) return;

  if (bevestigdeKampen.length === 0) {
    container.innerHTML = `<p style="color:var(--kleur-grijs);font-size:0.88rem;font-style:italic">Geen bevestigde kampen in de toekomst.</p>`;
    return;
  }

  container.innerHTML = bevestigdeKampen.slice(0, 5).map(k => {
    const kamp = k.kampen;
    const dagenTot = Math.ceil((new Date(kamp.startdatum + 'T00:00:00') - new Date()) / 86400000);
    const dagenLabel = dagenTot <= 0 ? 'Loopt nu' : dagenTot === 1 ? 'Morgen' : `Over ${dagenTot} dagen`;
    const dagenKleur = dagenTot <= 3 ? 'var(--kleur-koraal)' : dagenTot <= 14 ? '#f59e0b' : 'var(--kleur-middengroen)';

    return `
      <div class="dash-kamp-rij">
        <div style="flex:1;min-width:0">
          <div class="vet" style="font-size:0.95rem">${ontsnap(kamp.naam)}</div>
          <div class="font-klein kleur-grijs" style="margin-top:2px">
            📍 ${ontsnap(kamp.locatie)} &nbsp;·&nbsp;
            📅 ${datumNaarNL(kamp.startdatum)} – ${datumNaarNL(kamp.einddatum)}
          </div>
          <div style="margin-top:4px">
            <span class="badge badge-limoen">${ontsnap(kamp.leeftijdsgroep ?? '')}</span>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:0.78rem;font-weight:800;color:${dagenKleur}">${dagenLabel}</div>
          <a href="planner.html" class="knop knop-omtrek knop-klein" style="margin-top:8px;display:inline-block">
            Planning
          </a>
        </div>
      </div>`;
  }).join('');
}

function renderUitnodigingenSectie(uitnodigingen) {
  const sectie  = document.getElementById('uitnodigingen-sectie');
  const badge   = document.getElementById('uitnodigingen-badge');
  const lijst   = document.getElementById('uitnodigingen-lijst');
  if (!sectie || !lijst) return;

  if (uitnodigingen.length === 0) {
    sectie.classList.add('verborgen');
    return;
  }

  sectie.classList.remove('verborgen');
  if (badge) badge.textContent = uitnodigingen.length;

  lijst.innerHTML = uitnodigingen.map(k => {
    const kamp = k.kampen;
    return `
      <div class="dash-kamp-rij" style="border-left:4px solid var(--kleur-middengroen)">
        <div style="flex:1;min-width:0">
          <div class="vet">${ontsnap(kamp.naam)}</div>
          <div class="font-klein kleur-grijs">
            📍 ${ontsnap(kamp.locatie)} &nbsp;·&nbsp;
            📅 ${datumNaarNL(kamp.startdatum)} – ${datumNaarNL(kamp.einddatum)}
          </div>
        </div>
        <a href="planner.html" class="knop knop-accent knop-klein">Beantwoorden →</a>
      </div>`;
  }).join('');
}

function renderBeheerStats(stats) {
  const set = (id, waarde) => {
    const el = document.getElementById(id);
    if (el) el.textContent = waarde;
  };
  set('stat-actieve-kampen', stats.actieveKampen);
  set('stat-concept-kampen', stats.conceptKampen);
  set('stat-lesgevers',      stats.aantalLesgevers);
  set('stat-open-contracten', stats.openContracten);
}

async function haalKampenZonderBeschikbaarheidOp(lesgeverID) {
  const vandaag = lokaleISO(new Date());
  const [{ data: kampen }, { data: beschikbaarheden }] = await Promise.all([
    supabase.from('kampen')
      .select('id, naam, startdatum, einddatum')
      .neq('status', 'afgelopen')
      .gte('einddatum', vandaag)
      .order('startdatum'),
    supabase.from('beschikbaarheden')
      .select('kamp_id')
      .eq('lesgever_id', lesgeverID),
  ]);
  const ingediendIDs = new Set((beschikbaarheden ?? []).map(b => b.kamp_id));
  return (kampen ?? []).filter(k => !ingediendIDs.has(k.id));
}

function renderBeschikbaarheidReminder(kampen) {
  const sectie = document.getElementById('beschikbaarheid-reminder-sectie');
  if (!sectie) return;
  if (kampen.length === 0) { sectie.classList.add('verborgen'); return; }

  sectie.classList.remove('verborgen');
  const badge = sectie.querySelector('.sectie-badge');
  if (badge) badge.textContent = kampen.length;

  const lijst = document.getElementById('beschikbaarheid-reminder-lijst');
  if (!lijst) return;
  lijst.innerHTML = kampen.slice(0, 3).map(k => `
    <div class="dash-kamp-rij">
      <div style="flex:1;min-width:0">
        <div class="vet" style="font-size:0.88rem">${ontsnap(k.naam)}</div>
        <div class="font-klein kleur-grijs">${datumNaarNL(k.startdatum)} – ${datumNaarNL(k.einddatum)}</div>
      </div>
      <a href="beschikbaarheid.html" class="knop knop-accent knop-klein" style="flex-shrink:0">Ingeven →</a>
    </div>`).join('') +
    (kampen.length > 3
      ? `<div class="font-klein kleur-grijs" style="padding:8px 0">+ ${kampen.length - 3} meer kamp${kampen.length - 3 > 1 ? 'en' : ''}</div>`
      : '');
}

function renderFicheVoorstellenSectie(voorstellen) {
  const sectie = document.getElementById('fiche-voorstellen-sectie');
  const lijst  = document.getElementById('fiche-voorstellen-lijst');
  const badge  = document.getElementById('fiche-voorstellen-badge');
  if (!sectie || !lijst) return;

  if (voorstellen.length === 0) {
    sectie.classList.add('verborgen');
    return;
  }

  sectie.classList.remove('verborgen');
  if (badge) badge.textContent = voorstellen.length;

  lijst.innerHTML = voorstellen.map(f => {
    const aanmaker = f.profielen
      ? `${ontsnap(f.profielen.voornaam)} ${ontsnap(f.profielen.achternaam)}`
      : '—';
    return `
      <div class="dash-kamp-rij">
        <div style="flex:1">
          <div class="vet">${ontsnap(f.naam)}</div>
          <div class="font-klein kleur-grijs">Ingediend door ${aanmaker}</div>
        </div>
        <a href="fiches.html" class="knop knop-omtrek knop-klein">Bekijken →</a>
      </div>`;
  }).join('');
}
