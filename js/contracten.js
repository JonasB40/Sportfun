/**
 * contracten.js — Contractgeneratie en digitale ondertekening
 *
 * Genereert vrijwilligersovereenkomsten op basis van kamp- en
 * lesgeversgegevens. Beheert het ondertekenen via klikvakje + tijdstempel.
 *
 * @module contracten
 */

import { supabase } from './supabase.js?v=1780304789425';
import { toonToast, datumNaarNL, ontsnap } from './utils.js?v=1780304789425';
import { maakNotificatie } from './auth.js?v=1780304789425';
import {
  haalLimietenOp, haalStandaardVergoedingOp,
  berekenGewerkteDagen, berekenContractTotaal, formaatBedrag
} from './financieel.js?v=1780304789425';

// ── Automatische contractgeneratie bij koppeling ────────────────────

/**
 * Maak automatisch een contract aan voor een bevestigde lesgever.
 * Berekent pro-rata (kampdagen minus onbeschikbare dagen) en past de
 * standaard dagvergoeding toe op basis van rol.
 *
 * @param {string} lesgeverID
 * @param {string} kampID
 * @returns {Promise<object|null>} Aangemaakt contract of null bij fout.
 */
export async function genereerContractAutomatisch(lesgeverID, kampID) {
  try {
    // 1. Bestaat er al een contract voor deze combinatie?
    const { data: bestaand } = await supabase
      .from('contracten')
      .select('id')
      .eq('lesgever_id', lesgeverID)
      .eq('kamp_id', kampID)
      .maybeSingle();

    if (bestaand) {
      console.log('[contracten] Contract bestaat al voor', lesgeverID, kampID);
      return bestaand;
    }

    // 2. Haal kamp + lesgever + beschikbaarheid op (parallel)
    const [kampRes, lgRes, beschikRes, standaarden, limieten] = await Promise.all([
      supabase.from('kampen').select('*').eq('id', kampID).single(),
      supabase.from('profielen').select('*').eq('id', lesgeverID).single(),
      supabase.from('beschikbaarheden')
        .select('onbeschikbare_dagen')
        .eq('lesgever_id', lesgeverID).eq('kamp_id', kampID).maybeSingle(),
      haalStandaardVergoedingOp(),
      haalLimietenOp(),
    ]);

    if (kampRes.error) throw kampRes.error;
    if (lgRes.error)   throw lgRes.error;

    const kamp     = kampRes.data;
    const lesgever = lgRes.data;
    const onbeschikbareDagen = beschikRes.data?.onbeschikbare_dagen ?? [];

    // 3. Bereken pro-rata gewerkte dagen
    const gewerkteDagen = berekenGewerkteDagen(
      kamp.startdatum, kamp.einddatum, onbeschikbareDagen
    );

    // 4. Bepaal dagvergoeding op basis van rol (default 0 als rol onbekend)
    const dagvergoeding = Number(standaarden?.[lesgever?.rol] ?? limieten?.max_per_dag ?? 0);

    // 5. Bepaal kilometers op basis van profiel (km_per_locatie of 0)
    const kmMap = lesgever?.kilometers_per_locatie ?? {};
    const km    = Number(kmMap[kamp.locatie] ?? 0) || 0;
    const totaleKM = km * 2 * gewerkteDagen.length;

    // 6. Genereer contracttekst (mag niet falen — fallback naar minimale tekst)
    let inhoud;
    try {
      inhoud = genereerContractTekst(lesgever, kamp);
    } catch (e) {
      console.warn('[contracten] Contracttekst-fout, gebruik fallback:', e?.message);
      inhoud = `Vrijwilligersovereenkomst — ${kamp.naam}\n${lesgever.voornaam} ${lesgever.achternaam}`;
    }

    // 7. Sla op
    const { data: nieuw, error } = await supabase
      .from('contracten')
      .insert({
        lesgever_id:        lesgeverID,
        kamp_id:            kampID,
        contract_inhoud:    inhoud,
        vergoeding_per_dag: dagvergoeding,
        aantal_dagen:       gewerkteDagen.length,
        gewerkte_dagen:     gewerkteDagen,
        kilometers:         totaleKM,
        km_tarief:          Number(limieten?.km_tarief ?? 0.4361),
      })
      .select()
      .single();
    if (error) throw error;

    // 8. Notificeer lesgever
    await maakNotificatie(
      lesgeverID, 'contract_klaar',
      `Je contract voor "${kamp.naam}" is automatisch aangemaakt. Bekijk en onderteken in je profiel.`,
      'profiel.html'
    );

    return nieuw;
  } catch (fout) {
    console.error('[contracten] Auto-contract aanmaken mislukt:', fout?.message ?? fout);
    return null;
  }
}

// ── Contracten ophalen ──────────────────────────────────────────────

/**
 * Haal alle contracten op voor een lesgever.
 *
 * @param {string} lesgeverID - UUID van de lesgever.
 * @returns {Promise<object[]>} Lijst van contracten met kampinfo.
 */
export async function haalContractenOp(lesgeverID) {
  try {
    const { data, error } = await supabase
      .from('contracten')
      .select(`
        *,
        kampen (id, naam, locatie, startdatum, einddatum, leeftijdsgroep, status)
      `)
      .eq('lesgever_id', lesgeverID)
      .order('gegenereerd_op', { ascending: false });

    if (error) throw error;
    return data ?? [];
  } catch (fout) {
    console.error('[contracten] Fout bij ophalen contracten:', fout.message);
    toonToast('Kon contracten niet laden.', 'fout');
    return [];
  }
}

/**
 * Haal alle contracten op voor een specifiek kamp (voor admins).
 *
 * @param {string} kampID - UUID van het kamp.
 * @returns {Promise<object[]>} Lijst van contracten met lesgeversinfo.
 */
export async function haalKampContractenOp(kampID) {
  try {
    const { data, error } = await supabase
      .from('contracten')
      .select(`
        *,
        profielen!lesgever_id (voornaam, achternaam, email, rol)
      `)
      .eq('kamp_id', kampID);

    if (error) throw error;
    return data ?? [];
  } catch (fout) {
    console.error('[contracten] Fout bij ophalen kamp contracten:', fout.message);
    return [];
  }
}

// ── Contract genereren ──────────────────────────────────────────────

/**
 * Genereer de tekst van een vrijwilligersovereenkomst.
 *
 * @param {object} lesgever - Profiel van de lesgever.
 * @param {object} kamp - Kamp-object.
 * @returns {string} De volledige contracttekst.
 */
export function genereerContractTekst(lesgever, kamp) {
  const rolLabel = lesgever.rol === 'extra_hulp' ? 'Extra hulp' : 'Lesgever';
  const vandaag = datumNaarNL(new Date().toISOString().split('T')[0]);

  return `VRIJWILLIGERSOVEREENKOMST — SPORTKAMP
${'─'.repeat(50)}

Tussen:
  SportFun vzw
  Erkend als vrijwilligersorganisatie

En:
  ${lesgever.voornaam} ${lesgever.achternaam}
  E-mail: ${lesgever.email}
  ${lesgever.telefoon ? `Telefoon: ${lesgever.telefoon}` : ''}
  ${lesgever.adres ? `Adres: ${lesgever.adres}` : ''}

${'─'.repeat(50)}

KAMPGEGEVENS
  Kamp:      ${kamp.naam}
  Periode:   ${datumNaarNL(kamp.startdatum)} t.e.m. ${datumNaarNL(kamp.einddatum)}
  Locatie:   ${kamp.locatie}${kamp.adres ? ` — ${kamp.adres}` : ''}
  Leeftijdsgroep: ${kamp.leeftijdsgroep}
  Rol:       ${rolLabel}

${'─'.repeat(50)}

VERBINTENISSEN VAN DE VRIJWILLIGER

De vrijwilliger verbindt zich ertoe:

  1. Aanwezig te zijn op de afgesproken dagen gedurende de
     volledige kampperiode, tenzij vooraf gemeld bij de
     verantwoordelijke.

  2. De SportFun-gedragscode te respecteren en een positieve,
     veilige omgeving te creëren voor alle deelnemers.

  3. De fysieke en emotionele veiligheid van de deelnemers
     (kinderen) te bewaken en in te grijpen bij risicosituaties.

  4. Vertrouwelijk om te gaan met persoonsgegevens van kinderen
     en ouders, conform de AVG/GDPR-wetgeving.

  5. Geen beelden van deelnemers te delen op sociale media zonder
     uitdrukkelijke toestemming van SportFun vzw.

  6. Materialen en locatie met zorg te behandelen.

${'─'.repeat(50)}

VERGOEDING
  Deze overeenkomst betreft vrijwilligerswerk. Er wordt geen
  loon betaald. Eventuele onkostenvergoedingen worden apart
  afgesproken conform de wetgeving op vrijwilligerswerk.

${'─'.repeat(50)}

PRIVACYVERKLARING
  Uw persoonsgegevens worden verwerkt conform de AVG/GDPR-
  wetgeving, uitsluitend voor de organisatie van het kamp en
  de administratie van vrijwilligers. Ze worden niet gedeeld
  met derden.

${'─'.repeat(50)}

Opgesteld op: ${vandaag}

Handtekening vrijwilliger: ___________________________

Naam: ${lesgever.voornaam} ${lesgever.achternaam}
Datum ondertekening: ___________________________

${'─'.repeat(50)}
Namens SportFun vzw:
Handtekening: ___________________________
`;
}

/**
 * Genereer een mooi opgemaakt HTML-contract (met logo) voor afdrukken/PDF.
 *
 * @param {object} lesgever - Profiel van de lesgever (incl. eventueel handtekening_url).
 * @param {object} kamp - Kamp-object.
 * @param {object} [opties] - Extra opties.
 * @param {string} [opties.handtekeningURL] - Signed URL van de handtekening (optioneel).
 * @param {string} [opties.ondertekendOp] - ISO datum van ondertekening (optioneel).
 * @returns {string} Volledige HTML-pagina als string.
 */
export function genereerContractHTML(lesgever, kamp, opties = {}) {
  // ── Labels & datums ──────────────────────────────────────────────────
  const rolLabels = {
    lesgever: 'Lesgever', extra_hulp: 'Extra hulp',
    coordinator: 'Coördinator', admin: 'Beheerder',
  };
  const rolLabel = rolLabels[lesgever.rol] ?? lesgever.rol;
  const activiteitLabel = {
    lesgever:    'Voorbereiden en geven van sport initiaties als lesgever',
    extra_hulp:  'Ondersteunen van sport initiaties als extra hulp',
    coordinator: 'Coördineren en begeleiden van sportkampen',
    admin:       'Administratieve ondersteuning van sportkampen',
  }[lesgever.rol] ?? 'Vrijwilligersactiviteiten in het kader van de sportkampen';

  const vandaag     = datumNaarNL(new Date().toISOString().split('T')[0]);
  const ondertekend = opties.ondertekendOp
    ? datumNaarNL(opties.ondertekendOp.split('T')[0]) : null;

  // ── Financiële data ──────────────────────────────────────────────────
  const contract    = opties.contract ?? {};
  const dagBedrag   = Number(contract.vergoeding_per_dag ?? 0);
  const dagen       = Number(contract.aantal_dagen ?? 0);
  const km          = Number(contract.kilometers ?? 0);
  const tarief      = Number(contract.km_tarief ?? 0.4361);
  const gewerkteDagen = contract.gewerkte_dagen ?? [];

  const extraDagTypes = [
    { veld: 'voorbereidingsdag_dagen', label: 'Voorbereidingsdag' },
    { veld: 'opruimdag_dagen',         label: 'Opruimdag' },
    { veld: 'opleidingsdag_dagen',     label: 'Opleidingsdag' },
    { veld: 'evaluatiemoment_dagen',   label: 'Evaluatiemoment' },
  ];

  const vergoedingTotaal = +(dagBedrag * dagen).toFixed(2);
  const kmTotaal         = +(km * tarief).toFixed(2);
  const extraTotaal      = +extraDagTypes
    .reduce((som, t) => som + dagBedrag * Number(contract[t.veld] ?? 0), 0)
    .toFixed(2);
  const eindtotaal = +(vergoedingTotaal + extraTotaal + kmTotaal).toFixed(2);
  const heeftFinancieelData = dagen > 0 || km > 0 || extraTotaal > 0;

  // ── Escaped database-waarden voor veilige HTML-injectie ───────────────────
  const eLgVoornaam      = ontsnap(lesgever.voornaam ?? '');
  const eLgAchternaam    = ontsnap(lesgever.achternaam ?? '');
  const eLgAdres         = ontsnap(lesgever.adres ?? '');
  const eLgTelefoon      = ontsnap(lesgever.telefoon ?? '');
  const eLgEmail         = ontsnap(lesgever.email ?? '');
  const eLgRekeningnr    = ontsnap(lesgever.rekeningnummer ?? '');
  const eKampNaam        = ontsnap(kamp.naam ?? '');
  const eKampLocatie     = ontsnap(kamp.locatie ?? '');
  const eKampAdres       = ontsnap(kamp.adres ?? '');
  const eKampLeeftijd    = ontsnap(kamp.leeftijdsgroep ?? '');
  const eHandtekeningURL    = ontsnap(opties.handtekeningURL ?? '');
  const eSfHandtekeningURL  = ontsnap(opties.sportfunHandtekeningURL ?? '');

  // ── Helpers ──────────────────────────────────────────────────────────
  const f   = n => `€ ${Number(n ?? 0).toFixed(2).replace('.', ',')}`;
  const brk = v => ({ 0.25: '¼', 0.5: '½', 0.75: '¾', 1: '1' }[v] ?? String(v));
  const td  = (txt, right = false, bold = false, last = false) =>
    `<td style="padding:7px 10px;${last ? '' : 'border-bottom:1px solid #E5E7EB;'}
      ${right ? 'text-align:right;' : ''}${bold ? 'font-weight:700;' : ''}">${txt}</td>`;

  // ── Financieel blok (na artikels) ───────────────────────────────────
  const finRijen = [
    ...(dagen > 0 ? [`<tr>${td('Vrijwilligersvergoeding — kampdagen')}
      ${td(`${dagen} ${dagen === 1 ? 'dag' : 'dagen'}`, true)}
      ${td(f(dagBedrag), true)}
      ${td(f(vergoedingTotaal), true, true)}</tr>`] : []),
    ...extraDagTypes.map(({ veld, label }) => {
      const d = Number(contract[veld] ?? 0);
      if (d <= 0) return '';
      return `<tr>${td(label)}${td(`${brk(d)} dag`, true)}${td(f(dagBedrag), true)}${td(f(+(dagBedrag * d).toFixed(2)), true, true)}</tr>`;
    }),
    ...(km > 0 ? [`<tr>${td('Kilometervergoeding')}
      ${td(`${km.toFixed(1)} km`, true)}
      ${td(f(tarief) + '/km', true)}
      ${td(f(kmTotaal), true, true)}</tr>`] : []),
  ].filter(Boolean).join('');

  const finBlok = heeftFinancieelData ? `
    <div class="sectie-kop">Financieel overzicht</div>
    <table class="fin-tabel">
      <thead>
        <tr style="background:#F0FAF6">
          <th style="padding:7px 10px;text-align:left;border-bottom:2px solid #148869;color:#148869">Omschrijving</th>
          <th style="padding:7px 10px;text-align:right;border-bottom:2px solid #148869;color:#148869">Aantal</th>
          <th style="padding:7px 10px;text-align:right;border-bottom:2px solid #148869;color:#148869">Tarief</th>
          <th style="padding:7px 10px;text-align:right;border-bottom:2px solid #148869;color:#148869">Bedrag</th>
        </tr>
      </thead>
      <tbody>${finRijen}</tbody>
      <tfoot>
        <tr style="background:#194338;color:white">
          <td colspan="3" style="padding:10px;text-align:right;font-weight:800;font-size:10pt;letter-spacing:0.5px">
            TOTAAL FORFAITAIRE ONKOSTENVERGOEDING
          </td>
          <td style="padding:10px;text-align:right;font-weight:800;font-size:1.2rem;color:#D7FC5C">
            ${f(eindtotaal)}
          </td>
        </tr>
      </tfoot>
    </table>
    ${gewerkteDagen.length > 0 ? `
      <p class="kleine-tekst" style="margin-top:6px">
        <strong>Gewerkte kampdagen:</strong>
        ${gewerkteDagen.map(d => datumNaarNL(d, true)).join(' · ')}
      </p>` : ''}
    <p class="kleine-tekst" style="margin-top:6px;padding:8px 10px;background:#FFFDE7;border-left:3px solid #F59E0B;border-radius:0 4px 4px 0">
      De vrijwilliger verklaart hierbij op eer dat hij/zij in het kalenderjaar ${new Date().getFullYear()}
      nooit een forfaitaire onkostenvergoeding ontvangt bij de sportclub en/of één of meer andere
      organisaties die in totaal hoger is dan de wettelijk toegestane maxima
      (€&nbsp;44,02/dag · max. €&nbsp;1.761,00/jaar — tarieven 2026).
    </p>
  ` : '';

  // ── Handtekeningen ───────────────────────────────────────────────────
  const vrijwHandtekening = eHandtekeningURL ? `
    <img src="${eHandtekeningURL}" alt="Handtekening vrijwilliger"
         style="max-height:70px;max-width:200px;display:block;margin:10px 0 4px">
    <div class="kleine-tekst">Digitaal ondertekend op ${ondertekend ?? vandaag}</div>
  ` : ondertekend ? `
    <div class="handtekening-digitaal">
      <strong>✓ Digitaal ondertekend</strong><br>
      ${ondertekend} — ${eLgVoornaam} ${eLgAchternaam}
    </div>
  ` : '<div class="handtekening-lijn"></div>';

  const sfHandtekening = eSfHandtekeningURL ? `
    <img src="${eSfHandtekeningURL}" alt="Handtekening SportFun"
         style="max-height:70px;max-width:200px;display:block;margin:10px 0 4px">
    <div class="kleine-tekst">Datum: ${vandaag}</div>
  ` : '<div class="handtekening-lijn"></div>';

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>Vrijwilligersovereenkomst — ${eKampNaam}</title>
<style>
  @page { margin: 18mm 16mm 22mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    color: #1a2e28;
    line-height: 1.6;
    font-size: 10pt;
  }

  /* Accent balk */
  .accent-balk {
    height: 5px;
    background: linear-gradient(90deg, #194338 0%, #148869 55%, #D7FC5C 100%);
    margin-bottom: 18px;
    border-radius: 3px;
  }

  /* Header */
  .doc-header {
    display: flex; justify-content: space-between; align-items: center;
    padding-bottom: 16px;
    border-bottom: 1.5px solid #E5E7EB;
    margin-bottom: 22px; gap: 20px;
  }
  .doc-header img { max-width: 170px; height: auto; }
  .doc-header-rechts { text-align: right; }
  .doc-type {
    font-size: 6.5pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 2px; color: #148869; margin-bottom: 5px;
  }
  .doc-titel { font-size: 15pt; font-weight: 900; color: #194338; line-height: 1.15; }
  .doc-subtitel { font-size: 9pt; color: #6B7280; margin-top: 3px; }
  .badge-ondertekend {
    display: inline-block; margin-top: 8px; padding: 4px 14px;
    background: #148869; color: white; font-size: 8pt; font-weight: 700;
    border-radius: 20px; letter-spacing: 0.3px;
  }

  /* Partijen */
  .partijen-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
    margin-bottom: 20px;
  }
  .partij-blok {
    border: 1.5px solid #D1FAE5; border-radius: 8px;
    padding: 12px 14px 12px 18px;
    position: relative; background: #FAFFFE;
  }
  .partij-blok::before {
    content: ''; position: absolute; top: 0; left: 0;
    width: 4px; height: 100%;
    background: #148869; border-radius: 8px 0 0 8px;
  }
  .partij-label {
    font-size: 7pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1.2px; color: #148869; margin-bottom: 4px;
  }
  .partij-naam { font-weight: 800; font-size: 11pt; color: #194338; }
  .partij-detail { font-size: 9pt; color: #4B5563; line-height: 1.6; margin-top: 4px; }

  /* Kampgegevens */
  .kamp-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
    margin-bottom: 20px;
  }
  .kamp-item {
    background: #194338; color: white;
    border-radius: 8px; padding: 10px 12px;
  }
  .kamp-item-label {
    font-size: 6.5pt; text-transform: uppercase; letter-spacing: 1px;
    color: rgba(215,252,92,0.85); margin-bottom: 3px; font-weight: 700;
  }
  .kamp-item-waarde { font-size: 10pt; font-weight: 700; line-height: 1.3; }

  /* Sectiekoppen */
  .sectie-kop {
    display: flex; align-items: center; gap: 8px;
    font-size: 7pt; font-weight: 800; text-transform: uppercase;
    letter-spacing: 2px; color: #148869;
    margin: 22px 0 10px;
  }
  .sectie-kop::before {
    content: ''; display: block;
    width: 14px; height: 3px;
    background: #D7FC5C; border-radius: 2px; flex-shrink: 0;
  }
  .sectie-kop::after {
    content: ''; flex: 1; height: 1px;
    background: #E5E7EB;
  }

  /* Info-box */
  .info-box {
    background: #F0FAF6; border: 1.5px solid #D1FAE5;
    border-radius: 6px; padding: 10px 14px;
    margin-bottom: 14px; font-size: 9.5pt; color: #065F46;
    font-style: italic;
  }

  /* Artikels */
  .artikel {
    display: grid; grid-template-columns: 28px 1fr;
    gap: 10px; margin-bottom: 10px;
    page-break-inside: avoid; align-items: start;
  }
  .art-nr {
    width: 22px; height: 22px;
    background: #194338; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 8pt; font-weight: 800; color: #D7FC5C;
    flex-shrink: 0; margin-top: 1px;
  }
  .artikel-titel { font-weight: 700; font-size: 10pt; color: #194338; margin-bottom: 3px; }
  .artikel-inhoud { color: #374151; font-size: 9.5pt; }
  ul.artikel-lijst {
    margin: 5px 0 0; padding-left: 16px;
    color: #374151; font-size: 9.5pt;
  }
  ul.artikel-lijst li { margin-bottom: 2px; }

  /* Financieel */
  .fin-tabel {
    width: 100%; border-collapse: collapse;
    margin-bottom: 10px; font-size: 9.5pt;
  }
  .fin-tabel thead tr { background: #F0FAF6; }
  .fin-tabel thead th {
    padding: 8px 10px;
    border-bottom: 2px solid #148869;
    color: #148869; font-size: 8pt;
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
    text-align: left;
  }
  .fin-tabel thead th:not(:first-child) { text-align: right; }
  .fin-tabel tbody tr:nth-child(even) { background: #F9FAFB; }
  .fin-tabel td { vertical-align: middle; }

  /* Handtekeningen */
  .handtekening-sectie {
    display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
    margin-top: 28px; page-break-inside: avoid;
  }
  .handtekening-vak {
    border: 1.5px solid #E5E7EB;
    border-radius: 8px; padding: 14px 16px;
    min-height: 140px;
  }
  .handtekening-label {
    font-size: 7pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1.2px; color: #148869; margin-bottom: 4px;
  }
  .handtekening-naam { font-weight: 700; color: #194338; font-size: 11pt; }
  .handtekening-detail {
    font-size: 8.5pt; color: #6B7280;
    margin-top: 2px; margin-bottom: 10px;
  }
  .handtekening-lijn {
    border-bottom: 1.5px solid #CBD5E1;
    height: 58px; width: 100%; margin-top: 6px;
  }
  .handtekening-digitaal {
    margin-top: 10px; padding: 8px 12px;
    background: #F0FAF6; border: 1.5px solid #A7F3D0;
    border-radius: 6px; font-size: 8.5pt; color: #065F46;
    line-height: 1.6;
  }

  /* Footer */
  .doc-footer {
    margin-top: 30px; padding-top: 10px;
    border-top: 1px solid #E5E7EB;
    font-size: 7.5pt; color: #9CA3AF; text-align: center;
  }

  .kleine-tekst { font-size: 8.5pt; color: #6B7280; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .geen-print { display: none; }
  }
</style>
</head>
<body>

<div class="accent-balk"></div>

<div class="doc-header">
  <img src="sportfun-logo2.svg" alt="SportFun vzw">
  <div class="doc-header-rechts">
    <div class="doc-type">Overeenkomst vrijwilligerswerk</div>
    <div class="doc-titel">${eKampNaam}</div>
    <div class="doc-subtitel">Opgesteld op ${vandaag}</div>
    ${ondertekend ? `<div class="badge-ondertekend">✓ Ondertekend op ${ondertekend}</div>` : ''}
  </div>
</div>

<div class="sectie-kop">Partijen</div>
<div class="partijen-grid">
  <div class="partij-blok">
    <div class="partij-label">De sportclub</div>
    <div class="partij-naam">VZW SportFun</div>
    <div class="partij-detail">
      Heimolenstraat 157, 9100 Sint-Niklaas<br>
      Tel: 0474/800478 &middot; sportfunsombeke@gmail.com<br>
      Erkend vrijwilligersorganisatie<br>
      Vertegenwoordigd door: Christoph Draps, voorzitter
    </div>
  </div>
  <div class="partij-blok">
    <div class="partij-label">De vrijwilliger</div>
    <div class="partij-naam">${eLgVoornaam} ${eLgAchternaam}</div>
    <div class="partij-detail">
      ${eLgAdres ? eLgAdres + '<br>' : ''}
      ${eLgTelefoon ? eLgTelefoon + '<br>' : ''}
      ${eLgEmail}
      ${eLgRekeningnr ? `<br>Rekeningnr: <span style="font-family:monospace">${eLgRekeningnr}</span>` : ''}
    </div>
  </div>
</div>

<div class="sectie-kop">Kampgegevens</div>
<div class="kamp-grid">
  <div class="kamp-item">
    <div class="kamp-item-label">Kamp</div>
    <div class="kamp-item-waarde">${eKampNaam}</div>
  </div>
  <div class="kamp-item">
    <div class="kamp-item-label">Periode</div>
    <div class="kamp-item-waarde">${datumNaarNL(kamp.startdatum)} – ${datumNaarNL(kamp.einddatum)}</div>
  </div>
  <div class="kamp-item">
    <div class="kamp-item-label">Locatie</div>
    <div class="kamp-item-waarde">${eKampLocatie}${eKampAdres ? `<br><span style="font-size:8.5pt;font-weight:400;opacity:0.75">${eKampAdres}</span>` : ''}</div>
  </div>
  <div class="kamp-item">
    <div class="kamp-item-label">Leeftijdsgroep</div>
    <div class="kamp-item-waarde">${eKampLeeftijd}</div>
  </div>
  <div class="kamp-item">
    <div class="kamp-item-label">Rol vrijwilliger</div>
    <div class="kamp-item-waarde">${rolLabel}</div>
  </div>
  ${heeftFinancieelData ? `
  <div class="kamp-item" style="background:#D7FC5C;color:#194338">
    <div class="kamp-item-label" style="color:rgba(25,67,56,0.65)">Totale vergoeding</div>
    <div class="kamp-item-waarde">${f(eindtotaal)}</div>
  </div>` : ''}
</div>

<div class="sectie-kop">Bepalingen</div>
<div class="info-box">
  Tussen de sportclub en de vrijwilliger wordt het volgende overeengekomen,
  opgemaakt in twee exemplaren waarbij beide partijen een ondertekend exemplaar ontvangen.
</div>

<div class="artikel">
  <div class="art-nr">1</div>
  <div>
    <div class="artikel-titel">Activiteiten</div>
    <p class="artikel-inhoud">
      De sportclub is akkoord dat de vrijwilliger volgende activiteiten op zich zal nemen
      in het kader van vrijwilligerswerk: <strong>${activiteitLabel}</strong>.
      Deze activiteiten zullen belangeloos en zonder enige verplichting uitgevoerd worden
      in samenspraak met de sportclub.
    </p>
  </div>
</div>

<div class="artikel">
  <div class="art-nr">2</div>
  <div>
    <div class="artikel-titel">Geen bezoldiging</div>
    <p class="artikel-inhoud">
      De uitvoering van de activiteiten kan geen aanleiding geven tot enige bezoldiging.
      In de loop van de uitvoering van deze overeenkomst kan het vrijwilligerswerk op geen enkel
      ogenblik stilzwijgend omgevormd worden tot arbeid in het kader van een arbeidsovereenkomst.
      De sportclub heeft bijgevolg ook geen enkele verplichting in verband met sociale zekerheids-
      of fiscale regelgeving.
    </p>
  </div>
</div>

<div class="artikel">
  <div class="art-nr">3</div>
  <div>
    <div class="artikel-titel">Duur van de overeenkomst</div>
    <p class="artikel-inhoud">
      Het vrijwilligerswerk vangt aan op <strong>${datumNaarNL(kamp.startdatum)}</strong>
      en loopt tot <strong>${datumNaarNL(kamp.einddatum)}</strong>.
      De overeenkomst kan steeds eindigen in onderling akkoord tussen de sportclub en de vrijwilliger
      of door schriftelijke mededeling van één van beide partijen.
    </p>
  </div>
</div>

<div class="artikel">
  <div class="art-nr">4</div>
  <div>
    <div class="artikel-titel">Aansprakelijkheid</div>
    <p class="artikel-inhoud">
      De vrijwilliger kan slechts aansprakelijk gesteld worden voor schade veroorzaakt aan derden
      tijdens de vrijwilligersactiviteit in geval van opzet, zware fout of vaak voorkomende lichte fout.
    </p>
  </div>
</div>

<div class="artikel">
  <div class="art-nr">5</div>
  <div>
    <div class="artikel-titel">Verzekering</div>
    <p class="artikel-inhoud">
      De sportclub sluit een verzekering burgerrechtelijke aansprakelijkheid af
      (met uitzondering van de contractuele aansprakelijkheid) die de schade dekt die door
      de vrijwilliger zou veroorzaakt worden tijdens het uitoefenen van de vrijwilligersactiviteit.
    </p>
    <p class="artikel-inhoud" style="margin-top:4px">
      Verzekeringsmaatschappij: <strong>VITAS GROEP</strong> &nbsp;&middot;&nbsp;
      Polisnummer: <strong style="font-family:monospace">WD/379360530000</strong>
    </p>
  </div>
</div>

<div class="artikel">
  <div class="art-nr">6</div>
  <div>
    <div class="artikel-titel">Vergoeding</div>
    <p class="artikel-inhoud">
      De sportclub betaalt een forfaitaire onkostenvergoeding voor het verrichten van de taken
      opgesomd in artikel 1. Het precieze bedrag is opgenomen in het financieel overzicht
      onderaan dit contract. De vrijwilliger verklaart hierbij op eer dat hij/zij in de loop van
      het kalenderjaar nooit een forfaitaire onkostenvergoeding zal ontvangen voor vrijwilligerswerk
      die in totaal hoger is dan de wettelijk toegestane maxima (Wet van 3 juli 2005
      betreffende de rechten van vrijwilligers).
      ${km > 0 ? `Daarnaast wordt een verplaatsingsonkostenvergoeding van
      <strong>${f(tarief)}/km</strong> uitbetaald, met een maximum van 2.000 km per jaar.` : ''}
    </p>
  </div>
</div>

<div class="artikel">
  <div class="art-nr">7</div>
  <div>
    <div class="artikel-titel">Geheimhouding</div>
    <p class="artikel-inhoud">
      Indien de vrijwilliger kennis krijgt van geheimen die hem/haar zijn toevertrouwd in het kader
      van het vrijwilligerswerk mag hij/zij deze, overeenkomstig artikel 458 van het Strafwetboek,
      niet bekend maken tenzij de wet hem/haar hiertoe zou dwingen of indien hij/zij een getuigenis
      zou moeten afleggen. Overtreding van deze verplichting kan worden gestraft met gevangenisstraf
      en een geldboete.
    </p>
  </div>
</div>

<div class="artikel">
  <div class="art-nr">8</div>
  <div>
    <div class="artikel-titel">Aanwezigheid en afwezigheid</div>
    <p class="artikel-inhoud">
      De vrijwilliger waarschuwt de sportclub zo snel mogelijk indien hij/zij niet aanwezig
      kan zijn op de afgesproken momenten, zodat de continuïteit van de activiteiten gewaarborgd blijft.
    </p>
  </div>
</div>

<div class="artikel">
  <div class="art-nr">9</div>
  <div>
    <div class="artikel-titel">Documentatie en uitrusting</div>
    <p class="artikel-inhoud">
      De sportclub verbindt er zich toe aan de vrijwilliger de nodige documentatie en uitrusting
      ter beschikking te stellen voor het goed kunnen uitvoeren van de vrijwilligersactiviteiten.
    </p>
  </div>
</div>

<div class="artikel">
  <div class="art-nr">10</div>
  <div>
    <div class="artikel-titel">Meldingsplicht aan derden</div>
    <p class="artikel-inhoud">
      De vrijwilliger verbindt zich ertoe volgende instanties op de hoogte te brengen en
      zo nodig vooraf toestemming te verkrijgen voor het verrichten van vrijwilligerswerk:
    </p>
    <ul class="artikel-lijst">
      <li>De RVA in geval van werkloosheid of brugpensioen</li>
      <li>Het ziekenfonds in geval van arbeidsongeschiktheid</li>
      <li>Het OCMW in geval de vrijwilliger een leefloon of andere tussenkomst ontvangt</li>
    </ul>
  </div>
</div>

<div class="artikel">
  <div class="art-nr">11</div>
  <div>
    <div class="artikel-titel">Gegevensbescherming (AVG/GDPR)</div>
    <p class="artikel-inhoud">
      In overeenstemming met de Algemene Verordening Gegevensbescherming
      (AVG/GDPR — Verordening EU 2016/679) deelt de sportclub mee dat de persoonsgegevens van
      de vrijwilliger (naam, adres, contactgegevens, rekeningnummer) worden verwerkt
      <strong>uitsluitend</strong> voor de organisatie en administratie van vrijwilligersactiviteiten
      en de uitbetaling van wettelijke onkostenvergoedingen.
    </p>
    <ul class="artikel-lijst">
      <li>Verwerkingsverantwoordelijke: VZW SportFun, Heimolenstraat 157, 9100 Sint-Niklaas</li>
      <li>Rechtsgrond: uitvoering van vrijwilligersovereenkomst (art. 6.1.b AVG)</li>
      <li>Bewaartermijn: 7 jaar na afloop van de overeenkomst (conform boekhoudwetgeving)</li>
      <li>Gegevens worden niet doorgegeven aan derden, tenzij wettelijk verplicht</li>
      <li>U heeft recht op inzage, verbetering, verwijdering en beperking van uw gegevens</li>
    </ul>
    <p class="artikel-inhoud" style="margin-top:4px">
      Vragen omtrent gegevensverwerking: <strong>sportfunsombeke@gmail.com</strong>
    </p>
  </div>
</div>

${finBlok}

<div class="sectie-kop" style="margin-top:28px">Ondertekening</div>
<p class="kleine-tekst" style="margin-bottom:14px">
  Opgemaakt te ${eKampLocatie} op ${vandaag}, in twee exemplaren.
  Elke partij erkent een ondertekend exemplaar te hebben ontvangen.
</p>
<div class="handtekening-sectie">
  <div class="handtekening-vak">
    <div class="handtekening-label">De vrijwilliger</div>
    <div class="handtekening-naam">${eLgVoornaam} ${eLgAchternaam}</div>
    <div class="handtekening-detail">Voor akkoord — eigenhandig</div>
    ${vrijwHandtekening}
  </div>
  <div class="handtekening-vak">
    <div class="handtekening-label">Namens VZW SportFun</div>
    <div class="handtekening-naam">Christoph Draps</div>
    <div class="handtekening-detail">Voorzitter — voor akkoord</div>
    ${sfHandtekening}
  </div>
</div>

<div class="doc-footer">
  VZW SportFun &nbsp;&middot;&nbsp; Heimolenstraat 157, 9100 Sint-Niklaas &nbsp;&middot;&nbsp;
  sportfunsombeke@gmail.com &nbsp;&middot;&nbsp; 0474/800478<br>
  Vrijwilligersovereenkomst ${eKampNaam} &nbsp;&middot;&nbsp;
  ${eLgVoornaam} ${eLgAchternaam} &nbsp;&middot;&nbsp; ${vandaag}
</div>

<script>
  if (window.location.search !== '?preview') {
    window.addEventListener('load', () => setTimeout(() => window.print(), 400));
  }
<\/script>
</body>
</html>`;
}

/**
 * Open een nieuwe browsertab met het opgemaakte contract — klaar om af te drukken of als PDF op te slaan.
 *
 * @param {object} lesgever - Profiel.
 * @param {object} kamp - Kamp-object.
 * @param {object} [opties] - Optioneel: handtekeningURL, ondertekendOp.
 */
export function openContractAfdrukken(lesgever, kamp, opties = {}) {
  const html = genereerContractHTML(lesgever, kamp, opties);
  const venster = window.open('', '_blank');
  if (!venster) {
    toonToast('Sta pop-ups toe om het contract af te drukken.', 'fout');
    return;
  }
  venster.document.write(html);
  venster.document.close();
}

// ── Massa-acties (admin) ────────────────────────────────────────────

/**
 * Genereer contracten voor ALLE bevestigde lesgevers van een kamp tegelijk.
 * Slaat ze op en notificeert elke lesgever.
 *
 * @param {string} kampID
 * @returns {Promise<{aangemaakt: number, overgeslagen: number, fout: number}>}
 */
export async function genereerContractenVoorAlleBevestigden(kampID) {
  const resultaat = { aangemaakt: 0, overgeslagen: 0, fout: 0 };
  try {
    // 1. Haal kamp op
    const { data: kamp, error: kampFout } = await supabase
      .from('kampen').select('*').eq('id', kampID).single();
    if (kampFout) throw kampFout;

    // 2. Haal alle bevestigde lesgevers op
    const { data: koppelingen, error: kFout } = await supabase
      .from('kamp_lesgevers')
      .select('lesgever_id, profielen!lesgever_id(*)')
      .eq('kamp_id', kampID)
      .eq('status', 'bevestigd');
    if (kFout) throw kFout;

    if (!koppelingen?.length) {
      toonToast('Geen bevestigde lesgevers gevonden voor dit kamp.', 'info');
      return resultaat;
    }

    // 3. Haal bestaande contracten op (om dubbels te vermijden)
    const { data: bestaand } = await supabase
      .from('contracten').select('lesgever_id').eq('kamp_id', kampID);
    const alAangemaakt = new Set((bestaand ?? []).map(c => c.lesgever_id));

    // 4. Genereer + sla op voor elke nieuwe lesgever
    for (const k of koppelingen) {
      const lesgever = k.profielen;
      if (!lesgever) { resultaat.fout++; continue; }
      if (alAangemaakt.has(lesgever.id)) { resultaat.overgeslagen++; continue; }

      const tekst = genereerContractTekst(lesgever, kamp);
      const opgeslagen = await slaContractOp(lesgever.id, kampID, tekst);
      if (opgeslagen) resultaat.aangemaakt++; else resultaat.fout++;
    }

    const totaal = resultaat.aangemaakt + resultaat.overgeslagen;
    toonToast(
      `${resultaat.aangemaakt} contract(en) aangemaakt, ${resultaat.overgeslagen} bestonden al${resultaat.fout > 0 ? `, ${resultaat.fout} fouten` : ''}.`,
      resultaat.fout === 0 ? 'succes' : 'info'
    );
    return resultaat;
  } catch (fout) {
    console.error('[contracten] Massa-generatie fout:', fout?.message ?? fout);
    toonToast('Kon contracten niet genereren: ' + (fout?.message ?? fout), 'fout');
    return resultaat;
  }
}

/**
 * Open een gecombineerde PDF met alle ondertekende contracten van een kamp.
 *
 * @param {string} kampID
 * @returns {Promise<void>}
 */
export async function openBulkContractenAfdrukken(kampID) {
  try {
    const { data: kamp } = await supabase
      .from('kampen').select('*').eq('id', kampID).single();

    const { data: contracten, error } = await supabase
      .from('contracten')
      .select('*, profielen!lesgever_id(*)')
      .eq('kamp_id', kampID)
      .eq('ondertekend', true);
    if (error) throw error;

    if (!contracten?.length) {
      toonToast('Geen ondertekende contracten gevonden.', 'info');
      return;
    }

    // Haal SportFun-handtekening eenmalig op (gedeeld over alle contracten)
    let sportfunHandtekeningURL = null;
    try {
      const { data: sfData } = await supabase.storage
        .from('handtekeningen')
        .createSignedUrl('sportfun/handtekening.png', 3600);
      sportfunHandtekeningURL = sfData?.signedUrl ?? null;
    } catch { /* optioneel */ }

    // Bouw één HTML-document met alle contracten, gescheiden door page-breaks
    const losseContractenHTML = await Promise.all(
      contracten.map(async (c) => {
        const lesgever = c.profielen;
        // Probeer signed URL voor handtekening op te halen
        let handtekeningURL = null;
        if (lesgever?.handtekening_url) {
          try {
            const { data } = await supabase.storage
              .from('handtekeningen')
              .createSignedUrl(lesgever.handtekening_url, 3600);
            handtekeningURL = data?.signedUrl ?? null;
          } catch { /* niet kritiek */ }
        }
        const html = genereerContractHTML(lesgever, kamp, {
          handtekeningURL,
          sportfunHandtekeningURL,
          ondertekendOp: c.ondertekend_op,
          contract: c,
        });
        // Extraheer enkel de <body>-inhoud zodat alles in één document past
        const match = html.match(/<body>([\s\S]*?)<\/body>/);
        return match ? match[1] : html;
      })
    );

    const samengevoegd = losseContractenHTML
      .map((inhoud, i) => `<div class="contract-pagina" style="page-break-after:${i < losseContractenHTML.length - 1 ? 'always' : 'auto'}">${inhoud}</div>`)
      .join('');

    // Sjabloon-document met gedeelde styles
    const bulkHTML = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>Contracten — ${ontsnap(kamp.naam)}</title>
<style>
  @page { margin: 24mm 20mm; }
  body { font-family: 'Nunito', Arial, sans-serif; color: #194338; line-height: 1.55; font-size: 11pt; }
  .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 16px; border-bottom: 3px solid #194338; margin-bottom: 28px; }
  .header img { max-width: 180px; height: auto; }
  .header .doc-info { text-align: right; font-size: 9pt; color: #6B7280; }
  h1 { font-size: 1.5rem; font-weight: 800; margin: 0 0 4px; color: #194338; }
  h1 .accent { background: #D7FC5C; padding: 0 6px; border-radius: 4px; }
  h2 { font-size: 0.95rem; font-weight: 700; margin: 22px 0 10px; color: #148869; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  table td { padding: 5px 0; vertical-align: top; }
  table td.lbl { width: 32%; color: #6B7280; font-weight: 600; }
  ol { padding-left: 20px; } ol li { margin-bottom: 6px; }
  .ondertekening-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 40px; page-break-inside: avoid; }
  .ondertekening-vak { font-size: 10pt; }
  .ondertekening-vak .label { font-weight: 700; color: #194338; margin-bottom: 4px; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.5px; }
  .footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #E5E7EB; font-size: 8.5pt; color: #6B7280; text-align: center; }
  .badge-status { display: inline-block; padding: 3px 10px; border-radius: 20px; background: #148869; color: white; font-size: 9pt; font-weight: 700; }
  .contract-pagina:not(:first-child) { padding-top: 0; }
</style>
</head>
<body>
${samengevoegd}
<script>window.onload = () => setTimeout(() => window.print(), 400);<\/script>
</body>
</html>`;

    const venster = window.open('', '_blank');
    if (!venster) {
      toonToast('Sta pop-ups toe om de bulk-PDF te openen.', 'fout');
      return;
    }
    venster.document.write(bulkHTML);
    venster.document.close();
    toonToast(`${contracten.length} contracten klaar voor afdrukken.`, 'succes');
  } catch (fout) {
    console.error('[contracten] Bulk-afdrukken fout:', fout?.message ?? fout);
    toonToast('Kon bulk-PDF niet openen.', 'fout');
  }
}

/**
 * Stuur herinneringen naar alle lesgevers met een niet-ondertekend contract
 * voor een specifiek kamp (of alle actieve kampen).
 *
 * @param {string|null} kampID - Specifiek kamp of null voor alle actieve kampen.
 * @returns {Promise<{verzonden: number}>}
 */
export async function stuurHerinneringenOnondertekend(kampID = null) {
  try {
    let query = supabase
      .from('contracten')
      .select('id, lesgever_id, kamp_id, kampen(naam, status), profielen!lesgever_id(voornaam, achternaam, email)')
      .eq('ondertekend', false);
    if (kampID) query = query.eq('kamp_id', kampID);

    const { data: openstaand, error } = await query;
    if (error) throw error;

    // Filter: enkel kampen die nog niet afgelopen zijn
    const relevant = (openstaand ?? []).filter(c => c.kampen?.status !== 'afgelopen');

    if (relevant.length === 0) {
      toonToast('Geen openstaande contracten gevonden.', 'info');
      return { verzonden: 0 };
    }

    // Stuur portaal-notificatie aan elke lesgever
    let verzonden = 0;
    for (const c of relevant) {
      await maakNotificatie(
        c.lesgever_id,
        'contract_klaar',
        `📌 Herinnering: je contract voor "${c.kampen?.naam ?? 'het kamp'}" wacht nog op je ondertekening.`,
        'profiel.html'
      );

      // Probeer optionele e-mail edge function
      try {
        await supabase.functions.invoke('stuur-email-notificatie', {
          body: {
            type: 'herinnering_contract',
            naam: `${c.profielen?.voornaam} ${c.profielen?.achternaam}`,
            email: c.profielen?.email,
            kampNaam: c.kampen?.naam ?? '',
          },
        });
      } catch { /* Edge function optioneel */ }

      verzonden++;
    }

    toonToast(`${verzonden} herinnering(en) verstuurd.`, 'succes');
    return { verzonden };
  } catch (fout) {
    console.error('[contracten] Herinneringen fout:', fout?.message ?? fout);
    toonToast('Kon herinneringen niet versturen.', 'fout');
    return { verzonden: 0 };
  }
}

/**
 * Sla een nieuw contract op in de database.
 *
 * @param {string} lesgeverID - UUID van de lesgever.
 * @param {string} kampID - UUID van het kamp.
 * @param {string} contractInhoud - De gegenereerde contracttekst.
 * @returns {Promise<object|null>} Het aangemaakte contract of null bij fout.
 */
export async function slaContractOp(lesgeverID, kampID, contractInhoud) {
  try {
    const { data, error } = await supabase
      .from('contracten')
      .upsert({
        lesgever_id: lesgeverID,
        kamp_id: kampID,
        contract_inhoud: contractInhoud,
        ondertekend: false,
      }, { onConflict: 'lesgever_id,kamp_id' })
      .select()
      .single();

    if (error) throw error;

    // Stuur notificatie naar lesgever
    await maakNotificatie(
      lesgeverID,
      'contract_klaar',
      'Je contract is klaar om te ondertekenen.',
      'profiel.html'
    );

    toonToast('Contract aangemaakt voor lesgever.', 'succes');
    return data;
  } catch (fout) {
    console.error('[contracten] Fout bij opslaan contract:', fout.message);
    toonToast('Kon contract niet opslaan.', 'fout');
    return null;
  }
}

// ── Contract ondertekenen ───────────────────────────────────────────

/**
 * Onderteken een contract digitaal (klikvakje-bevestiging).
 * Slaat tijdstempel op in de database.
 *
 * @param {string} contractID - UUID van het contract.
 * @returns {Promise<boolean>} True bij succes.
 */
export async function onderteken(contractID) {
  try {
    const { error } = await supabase
      .from('contracten')
      .update({
        ondertekend: true,
        ondertekend_op: new Date().toISOString(),
      })
      .eq('id', contractID);

    if (error) throw error;
    toonToast('Contract succesvol ondertekend.', 'succes');
    return true;
  } catch (fout) {
    console.error('[contracten] Fout bij ondertekenen contract:', fout.message);
    toonToast('Kon contract niet ondertekenen.', 'fout');
    return false;
  }
}

// ── Renderen ────────────────────────────────────────────────────────

/**
 * Render een contract-item in de contractenlijst.
 *
 * @param {object} contract - Het contract-object inclusief kampinfo.
 * @returns {string} HTML-string voor het contract-item.
 */
export function renderContractItem(contract) {
  const kamp = contract.kampen;

  // Status-pillen: aangemaakt → ondertekend → betaald
  let statusBadge;
  if (contract.betaald) {
    statusBadge = `<span class="badge" style="background:var(--kleur-limoen);color:var(--kleur-donkergroen)">💰 Betaald${contract.betaald_op ? ' op ' + datumNaarNL(contract.betaald_op.split('T')[0]) : ''}</span>`;
  } else if (contract.ondertekend) {
    statusBadge = `<span class="badge badge-goedgekeurd">✓ Ondertekend op ${datumNaarNL(contract.ondertekend_op?.split('T')[0])}</span>`;
  } else {
    statusBadge = `<span class="badge badge-grijs">📄 Wacht op ondertekening</span>`;
  }

  // Toon totaalbedrag indien aanwezig
  const totaal = contract.totaal_bedrag ?? 0;
  const bedragBadge = totaal > 0
    ? `<span class="badge" style="background:var(--kleur-donkergroen);color:var(--kleur-limoen)">€${Number(totaal).toFixed(2).replace('.',',')}</span>` : '';

  return `
    <div class="kaart" style="margin-bottom:12px">
      <div class="kaart-header">
        <div style="flex:1;min-width:0">
          <div class="kaart-titel">${kamp?.naam ?? 'Onbekend kamp'}</div>
          <div class="kamp-meta mt-8">
            📅 ${kamp ? `${datumNaarNL(kamp.startdatum)} – ${datumNaarNL(kamp.einddatum)}` : ''} &nbsp;·&nbsp;
            📍 ${kamp?.locatie ?? ''}
          </div>
          <div class="mt-8 flex-gap" style="flex-wrap:wrap">
            ${statusBadge}
            ${bedragBadge}
          </div>
        </div>
        <div class="kaart-acties">
          <button class="knop ${contract.ondertekend ? 'knop-omtrek' : 'knop-accent'} knop-klein"
                  data-contract="${contract.id}"
                  onclick="window._openContract('${contract.id}')">
            ${contract.ondertekend ? 'Bekijken' : 'Ondertekenen'}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render de volledige inhoud van een contract-modal.
 *
 * @param {object} contract - Het contract-object.
 * @returns {string} HTML-string voor de modal-inhoud.
 */
export function renderContractModal(contract) {
  const isOndertekend = contract.ondertekend;

  return `
    <div class="contract-tekst" style="white-space:pre-wrap">${ontsnap(contract.contract_inhoud ?? 'Geen contractinhoud beschikbaar.')}</div>

    <div class="gdpr-melding mt-16">
      🔒 Uw gegevens worden verwerkt conform de AVG/GDPR-wetgeving. Ze worden
      niet gedeeld met derden en uitsluitend gebruikt voor de organisatie van
      sportkampen en de administratie van vrijwilligers.
    </div>

    ${!isOndertekend ? `
      <div class="formulier-groep mt-16">
        <label class="checkbox-groep">
          <input type="checkbox" id="akkoord-checkbox">
          <span>Ik heb het contract gelezen en ga akkoord met de voorwaarden.</span>
        </label>
      </div>
      <div class="modal-voetlijn" style="border:none;padding:0;margin-top:12px">
        <button class="knop knop-accent knop-groot" id="onderteken-knop" disabled data-contract="${contract.id}">
          Ondertekenen
        </button>
      </div>
    ` : `
      <div class="kaart" style="background:rgba(20,136,105,0.06);border:1px solid rgba(20,136,105,0.2);margin-top:16px">
        <div style="color:var(--kleur-middengroen);font-weight:700;margin-bottom:10px">
          ✓ Dit contract werd ondertekend op ${datumNaarNL(contract.ondertekend_op?.split('T')[0])}.
        </div>
        <button class="knop knop-primair knop-klein"
                onclick="window._printContract && window._printContract('${contract.id}')">
          📄 Afdrukken als PDF
        </button>
      </div>
    `}
  `;
}
