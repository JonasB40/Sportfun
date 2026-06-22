/**
 * financieel.js — Vrijwilligersvergoeding & contractberekening
 *
 * Verzorgt alle financiële logica:
 *  - Berekening pro-rata (kampdagen − onbeschikbare dagen)
 *  - Daglimieten en jaarmax controles
 *  - Standaardvergoeding per rol
 *  - Jaartotalen per lesgever
 *
 * @module financieel
 */

import { supabase } from './supabase.js?v=1780304789425';
import { toonToast } from './utils.js?v=1780304789425';

// ── Constanten (synced met financiele_limieten tabel) ─────────────────
export const HUIDIG_JAAR = new Date().getFullYear();
export const KM_TARIEF_2026   = 0.4361;
export const MAX_PER_DAG_2026 = 44.02;
export const MAX_PER_JAAR_2026 = 1761.00;

// Standaardvergoeding per rol (fallback als DB niet ingelezen kan worden)
const STANDAARD_FALLBACK = {
  lesgever:     44.02,
  extra_hulp:   35.00,
  coordinator:  44.02,
  admin:        44.02,
};

// ── Laad limieten en standaarden uit DB ──────────────────────────────

let cacheLimiet     = null;
let cacheStandaard  = null;

/**
 * Haal de wettelijke limieten op voor een specifiek jaar.
 * Cached na eerste aanroep.
 *
 * @param {number} [jaar=HUIDIG_JAAR]
 * @returns {Promise<{max_per_dag: number, max_per_jaar: number, km_tarief: number}>}
 */
export async function haalLimietenOp(jaar = HUIDIG_JAAR) {
  if (cacheLimiet?.jaar === jaar) return cacheLimiet;
  try {
    const { data, error } = await supabase
      .from('financiele_limieten').select('*').eq('jaar', jaar).maybeSingle();
    if (error) throw error;
    cacheLimiet = data ?? {
      jaar, max_per_dag: MAX_PER_DAG_2026,
      max_per_jaar: MAX_PER_JAAR_2026, km_tarief: KM_TARIEF_2026,
    };
    return cacheLimiet;
  } catch {
    return {
      jaar, max_per_dag: MAX_PER_DAG_2026,
      max_per_jaar: MAX_PER_JAAR_2026, km_tarief: KM_TARIEF_2026,
    };
  }
}

/**
 * Haal de standaard dagvergoeding op per rol.
 * @returns {Promise<Record<string, number>>}
 */
export async function haalStandaardVergoedingOp() {
  if (cacheStandaard) return cacheStandaard;
  try {
    const { data, error } = await supabase
      .from('standaard_vergoeding').select('*');
    if (error) throw error;
    cacheStandaard = {};
    for (const rij of (data ?? [])) cacheStandaard[rij.rol] = Number(rij.dagvergoeding);
    return cacheStandaard;
  } catch {
    cacheStandaard = { ...STANDAARD_FALLBACK };
    return cacheStandaard;
  }
}

// ── Pro-rata berekening ───────────────────────────────────────────────

/**
 * Bereken de gewerkte dagen voor een kamp op basis van beschikbaarheid.
 *
 * @param {string} kampStart - ISO startdatum.
 * @param {string} kampEind - ISO einddatum.
 * @param {string[]} onbeschikbareDagen - Array van ISO datums.
 * @returns {string[]} Array van werkelijk gewerkte dagen (ISO).
 */
export function berekenGewerkteDagen(kampStart, kampEind, onbeschikbareDagen = []) {
  const dagen = [];
  const huidig = new Date(kampStart + 'T00:00:00');
  const eind = new Date(kampEind + 'T00:00:00');
  const onSet = new Set(onbeschikbareDagen);
  while (huidig <= eind) {
    const iso = lokaalISO(huidig);
    if (!onSet.has(iso)) dagen.push(iso);
    huidig.setDate(huidig.getDate() + 1);
  }
  return dagen;
}

/**
 * Bereken het totaal van een contract (inclusief extra dagsoorten).
 *
 * @param {object} contract - { vergoeding_per_dag, aantal_dagen, kilometers, km_tarief,
 *   voorbereidingsdag_dagen, opruimdag_dagen, opleidingsdag_dagen, evaluatiemoment_dagen }
 * @returns {{vergoedingBedrag: number, extraBedrag: number, kmBedrag: number, totaal: number}}
 */
export function berekenContractTotaal(contract) {
  const dagBedrag = Number(contract.vergoeding_per_dag ?? 0);
  const dagen     = Number(contract.aantal_dagen ?? 0);
  const km        = Number(contract.kilometers ?? 0);
  const tarief    = Number(contract.km_tarief ?? KM_TARIEF_2026);
  const extraDagen = [
    'voorbereidingsdag_dagen', 'opruimdag_dagen',
    'opleidingsdag_dagen', 'evaluatiemoment_dagen',
  ].reduce((som, k) => som + Number(contract[k] ?? 0), 0);

  const vergoedingBedrag = +(dagBedrag * dagen).toFixed(2);
  const extraBedrag      = +(dagBedrag * extraDagen).toFixed(2);
  const kmBedrag         = +(km * tarief).toFixed(2);
  const totaal           = +(vergoedingBedrag + extraBedrag + kmBedrag).toFixed(2);
  return { vergoedingBedrag, extraBedrag, kmBedrag, totaal };
}

// ── Validatie ────────────────────────────────────────────────────────

/**
 * Valideer een contract tegen daglimiet en jaarmax.
 *
 * @param {object} contract - Te valideren contract.
 * @param {string} lesgeverID
 * @param {string|null} contractIDNegeren - Bestaand contract dat genegeerd moet worden (bij update).
 * @returns {Promise<{geldig: boolean, fout: string|null, jaarTotaal: number, limiet: object}>}
 */
export async function valideerContract(contract, lesgeverID, contractIDNegeren = null) {
  const limiet = await haalLimietenOp();

  // 1. Daglimiet
  const dagBedrag = Number(contract.vergoeding_per_dag ?? 0);
  if (dagBedrag > limiet.max_per_dag) {
    return {
      geldig: false,
      fout: `Dagvergoeding van €${dagBedrag.toFixed(2)} overschrijdt het wettelijke maximum van €${limiet.max_per_dag.toFixed(2)}/dag.`,
      jaarTotaal: 0, limiet,
    };
  }

  // 2. Jaarmax
  const { totaal } = berekenContractTotaal(contract);
  const jaarTotaal = await haalJaarTotaalLesgeverOp(lesgeverID, HUIDIG_JAAR, contractIDNegeren);
  const nieuwTotaal = jaarTotaal + totaal;

  if (nieuwTotaal > limiet.max_per_jaar) {
    const overschrijding = +(nieuwTotaal - limiet.max_per_jaar).toFixed(2);
    return {
      geldig: false,
      fout: `Jaartotaal zou €${nieuwTotaal.toFixed(2)} worden (max €${limiet.max_per_jaar.toFixed(2)}). Overschrijding: €${overschrijding.toFixed(2)}.`,
      jaarTotaal, limiet,
    };
  }

  return { geldig: true, fout: null, jaarTotaal, limiet };
}

// ── Jaartotaal ophalen ───────────────────────────────────────────────

/**
 * Haal het totaal van alle contracten op voor een lesgever in een specifiek jaar.
 *
 * @param {string} lesgeverID
 * @param {number} [jaar=HUIDIG_JAAR]
 * @param {string|null} negeerContractID - Contract dat genegeerd moet worden (bij eigen update).
 * @returns {Promise<number>}
 */
export async function haalJaarTotaalLesgeverOp(lesgeverID, jaar = HUIDIG_JAAR, negeerContractID = null) {
  try {
    let q = supabase
      .from('contracten')
      .select('id, totaal_bedrag, kampen!inner(startdatum)')
      .eq('lesgever_id', lesgeverID)
      .gte('kampen.startdatum', `${jaar}-01-01`)
      .lte('kampen.startdatum', `${jaar}-12-31`);
    if (negeerContractID) q = q.neq('id', negeerContractID);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).reduce((som, c) => som + Number(c.totaal_bedrag ?? 0), 0);
  } catch (fout) {
    console.warn('[financieel] Jaartotaal ophalen mislukt:', fout?.message);
    return 0;
  }
}

/**
 * Haal het volledige financieel overzicht op voor alle lesgevers.
 * @param {number} [jaar=HUIDIG_JAAR]
 * @returns {Promise<object[]>} Lijst van {lesgever_id, voornaam, achternaam, rol, totaal, uitbetaald, aantal}
 */
export async function haalOverzichtPerLesgeverOp(jaar = HUIDIG_JAAR) {
  try {
    const { data, error } = await supabase
      .from('contracten')
      .select(`
        id, lesgever_id, totaal_bedrag, betaald,
        vergoeding_per_dag, aantal_dagen, kilometers, km_tarief,
        voorbereidingsdag_dagen, opruimdag_dagen, opleidingsdag_dagen, evaluatiemoment_dagen,
        kampen!inner(startdatum, naam),
        profielen!lesgever_id(voornaam, achternaam, rol, email)
      `)
      .gte('kampen.startdatum', `${jaar}-01-01`)
      .lte('kampen.startdatum', `${jaar}-12-31`);
    if (error) throw error;

    const perLesgever = new Map();
    for (const c of (data ?? [])) {
      const id = c.lesgever_id;
      if (!perLesgever.has(id)) {
        perLesgever.set(id, {
          lesgever_id: id,
          voornaam: c.profielen?.voornaam ?? '',
          achternaam: c.profielen?.achternaam ?? '',
          rol: c.profielen?.rol ?? '',
          email: c.profielen?.email ?? '',
          totaal: 0, uitbetaald: 0, openstaand: 0, aantal: 0,
          vergoeding: 0, km_vergoeding: 0,
        });
      }
      const rij = perLesgever.get(id);
      const bedrag = Number(c.totaal_bedrag ?? 0);
      rij.totaal += bedrag;
      if (c.betaald) rij.uitbetaald += bedrag;
      else rij.openstaand += bedrag;
      rij.aantal++;
      const extraDagen = [
        'voorbereidingsdag_dagen', 'opruimdag_dagen',
        'opleidingsdag_dagen', 'evaluatiemoment_dagen',
      ].reduce((som, k) => som + Number(c[k] ?? 0), 0);
      rij.vergoeding   += +(Number(c.vergoeding_per_dag ?? 0) * (Number(c.aantal_dagen ?? 0) + extraDagen)).toFixed(2);
      rij.km_vergoeding += +(Number(c.kilometers ?? 0) * Number(c.km_tarief ?? 0)).toFixed(2);
    }

    return [...perLesgever.values()].sort((a, b) =>
      (a.achternaam ?? '').localeCompare(b.achternaam ?? ''));
  } catch (fout) {
    console.error('[financieel] Overzicht per lesgever mislukt:', fout?.message);
    return [];
  }
}

/**
 * Haal alle contracten chronologisch op met financiële info.
 * @param {number} [jaar=HUIDIG_JAAR]
 * @returns {Promise<object[]>}
 */
export async function haalAlleContractenFinancieelOp(jaar = HUIDIG_JAAR) {
  try {
    const { data, error } = await supabase
      .from('contracten')
      .select(`
        *,
        kampen!inner(id, naam, startdatum, einddatum, locatie),
        profielen!lesgever_id(voornaam, achternaam, rol, email)
      `)
      .gte('kampen.startdatum', `${jaar}-01-01`)
      .lte('kampen.startdatum', `${jaar}-12-31`)
      .order('startdatum', { foreignTable: 'kampen', ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch (fout) {
    console.error('[financieel] Alle contracten ophalen mislukt:', fout?.message);
    return [];
  }
}

// ── Hulpfuncties ─────────────────────────────────────────────────────

/** Lokale datum als YYYY-MM-DD (tijdzone-veilig). */
function lokaalISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Formatteer bedrag als €123,45 (Belgisch formaat). */
export function formaatBedrag(n) {
  return '€' + Number(n ?? 0).toFixed(2).replace('.', ',');
}

/** Pil-class op basis van contract-status. */
export function contractStatusPil(contract) {
  if (contract.betaald) {
    return '<span class="badge" style="background:var(--kleur-limoen);color:var(--kleur-donkergroen)">💰 Betaald</span>';
  }
  if (contract.ondertekend) {
    return '<span class="badge badge-goedgekeurd">✓ Ondertekend</span>';
  }
  return '<span class="badge badge-grijs">📄 Aangemaakt</span>';
}

// ── Markeer als betaald / niet betaald ───────────────────────────────

/**
 * Markeer een contract als betaald (zet datum) of terug op niet-betaald.
 *
 * @param {string} contractID
 * @param {boolean} betaald
 * @returns {Promise<boolean>}
 */
export async function markeerBetaaldStatus(contractID, betaald) {
  try {
    const { error } = await supabase
      .from('contracten')
      .update({
        betaald,
        betaald_op: betaald ? new Date().toISOString() : null,
      })
      .eq('id', contractID);
    if (error) throw error;
    toonToast(betaald ? 'Contract gemarkeerd als betaald.' : 'Status teruggezet naar niet-betaald.', 'succes');
    return true;
  } catch (fout) {
    console.error('[financieel] Betaalstatus bijwerken mislukt:', fout?.message);
    toonToast('Kon betaalstatus niet wijzigen.', 'fout');
    return false;
  }
}

// ── Contract aanmaken/bijwerken ──────────────────────────────────────

/**
 * Maak of werk een contract bij met financiële velden.
 *
 * @param {object} data - Contract data.
 * @returns {Promise<object|null>}
 */
export async function slaContractBijwerkenOp(data) {
  try {
    // Velden die we expliciet sturen
    // Herbereken totaal_bedrag zodat het altijd actueel is
    const { totaal } = berekenContractTotaal({
      vergoeding_per_dag:      data.vergoeding_per_dag,
      aantal_dagen:            data.aantal_dagen,
      kilometers:              data.kilometers ?? 0,
      km_tarief:               data.km_tarief ?? KM_TARIEF_2026,
      voorbereidingsdag_dagen: data.voorbereidingsdag_dagen ?? 0,
      opruimdag_dagen:         data.opruimdag_dagen ?? 0,
      opleidingsdag_dagen:     data.opleidingsdag_dagen ?? 0,
      evaluatiemoment_dagen:   data.evaluatiemoment_dagen ?? 0,
    });

    const payload = {
      vergoeding_per_dag:       data.vergoeding_per_dag,
      aantal_dagen:             data.aantal_dagen,
      kilometers:               data.kilometers ?? 0,
      km_tarief:                data.km_tarief ?? KM_TARIEF_2026,
      gewerkte_dagen:           data.gewerkte_dagen ?? [],
      opmerking:                data.opmerking ?? null,
      contract_inhoud:          data.contract_inhoud,
      voorbereidingsdag_dagen:  data.voorbereidingsdag_dagen ?? 0,
      opruimdag_dagen:          data.opruimdag_dagen ?? 0,
      opleidingsdag_dagen:      data.opleidingsdag_dagen ?? 0,
      evaluatiemoment_dagen:    data.evaluatiemoment_dagen ?? 0,
      totaal_bedrag:            totaal,
    };

    const { data: updated, error } = await supabase
      .from('contracten')
      .update(payload)
      .eq('id', data.id)
      .select()
      .single();

    if (error) throw error;
    return updated;
  } catch (fout) {
    console.error('[financieel] Contract opslaan mislukt:', fout?.message ?? fout);
    toonToast('Kon contract niet opslaan: ' + (fout?.message ?? fout), 'fout');
    return null;
  }
}
