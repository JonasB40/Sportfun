/**
 * admin.js — Beheerfuncties voor admin en coördinatoren
 *
 * Beheert kampen, lesgevers, uitnodigingen, fiches en dagprogramma's.
 *
 * @module admin
 */

import { supabase, maakGebruikerViaSignup } from './supabase.js?v=1780304789425';
import { toonToast, datumNaarNL, genereerToken, ontsnap, lokaleISO } from './utils.js?v=1780304789425';
import { genereerContractTekst, slaContractOp } from './contracten.js?v=1780304789425';
import { maakNotificatie } from './auth.js?v=1780304789425';

// ── Kampbeheer ──────────────────────────────────────────────────────

/**
 * Haal alle kampen op, inclusief de verantwoordelijke.
 *
 * @returns {Promise<object[]>} Lijst van kamp-objecten.
 */
export async function haalAlleKampenOp() {
  try {
    const { data, error } = await supabase
      .from('kampen')
      .select(`
        *,
        verantwoordelijke_profiel:profielen!verantwoordelijke (voornaam, achternaam)
      `)
      .order('startdatum', { ascending: true });

    if (error) throw error;
    return data ?? [];
  } catch (fout) {
    console.error('[admin] Fout bij ophalen kampen:', fout.message);
    toonToast('Kon kampen niet laden.', 'fout');
    return [];
  }
}

/**
 * Sla een nieuw kamp op of werk een bestaand kamp bij.
 *
 * @param {object} kampData - Alle kampvelden.
 * @param {string|null} kampID - UUID bij bijwerken, null bij aanmaken.
 * @returns {Promise<object|null>} Het opgeslagen kamp of null bij fout.
 */
export async function slaKampOp(kampData, kampID = null) {
  try {
    let query;
    if (kampID) {
      query = supabase.from('kampen').update(kampData).eq('id', kampID).select().single();
    } else {
      query = supabase.from('kampen').insert(kampData).select().single();
    }
    const { data, error } = await query;
    if (error) throw error;
    toonToast(kampID ? 'Kamp bijgewerkt.' : 'Kamp aangemaakt.', 'succes');
    return data;
  } catch (fout) {
    console.error('[admin] Fout bij opslaan kamp:', fout.message);
    toonToast('Kon kamp niet opslaan: ' + fout.message, 'fout');
    return null;
  }
}

/**
 * Archiveer alle verlopen kampen (status 'actief', einddatum < vandaag).
 * Retourneert het aantal gearchiveerde kampen.
 */
export async function archiveerVerloopenKampen() {
  const vandaag = lokaleISO(new Date());
  try {
    const { data, error } = await supabase
      .from('kampen')
      .update({ status: 'afgelopen' })
      .eq('status', 'actief')
      .lt('einddatum', vandaag)
      .select('id');
    if (error) throw error;
    return (data ?? []).length;
  } catch (fout) {
    console.error('[admin] archiveerVerloopenKampen:', fout.message);
    return 0;
  }
}

/**
 * Werk de status van een kamp bij.
 *
 * @param {string} kampID - UUID van het kamp.
 * @param {'concept'|'actief'|'afgelopen'} status - De nieuwe status.
 */
export async function werkKampStatusBij(kampID, status) {
  try {
    const { error } = await supabase.from('kampen').update({ status }).eq('id', kampID);
    if (error) throw error;
    toonToast('Kampstatus bijgewerkt.', 'succes');
  } catch (fout) {
    toonToast('Kon status niet bijwerken.', 'fout');
  }
}

// ── Lesgever-koppeling ──────────────────────────────────────────────

/**
 * Haal de gekoppelde lesgevers op voor een kamp,
 * inclusief hun beschikbaarheid voor dat kamp.
 *
 * @param {string} kampID - UUID van het kamp.
 * @returns {Promise<object[]>} Lijst met lesgeversinfo + beschikbaarheid.
 */
export async function haalKampLesgeversOp(kampID) {
  try {
    const { data, error } = await supabase
      .from('kamp_lesgevers')
      .select(`
        id,
        profielen!lesgever_id (id, voornaam, achternaam, email, rol, telefoon)
      `)
      .eq('kamp_id', kampID);

    if (error) throw error;

    // Haal beschikbaarheden op
    const lesgevers = (data ?? []).map(r => r.profielen).filter(Boolean);
    const beschikbaarheden = await haalBeschikbaarhedenVoorKamp(kampID);

    return lesgevers.map(lg => ({
      ...lg,
      beschikbaarheid: beschikbaarheden.find(b => b.lesgever_id === lg.id) ?? null,
    }));
  } catch (fout) {
    console.error('[admin] Fout bij ophalen kamp lesgevers:', fout.message);
    return [];
  }
}

/**
 * Haal alle beschikbaarheden op voor een kamp.
 *
 * @param {string} kampID - UUID van het kamp.
 * @returns {Promise<object[]>}
 */
async function haalBeschikbaarhedenVoorKamp(kampID) {
  const { data, error } = await supabase
    .from('beschikbaarheden')
    .select('*')
    .eq('kamp_id', kampID);
  if (error) console.error('[admin] Fout bij ophalen beschikbaarheden:', error.message);
  return data ?? [];
}

/**
 * Koppel een lesgever aan een kamp.
 *
 * @param {string} kampID - UUID van het kamp.
 * @param {string} lesgeverID - UUID van de lesgever.
 * @param {string} kampNaam - Naam van het kamp (voor notificatie).
 * @param {boolean} [direct=false] - Als true: meteen koppelen als 'bevestigd'
 *   (geen aanvaard/weiger-flow). Lesgever krijgt enkel een informatieve melding.
 * @returns {Promise<boolean>} True bij succes.
 */
export async function koppelLesgever(kampID, lesgeverID, kampNaam, direct = false) {
  const nieuweStatus = direct ? 'bevestigd' : 'gevraagd';
  try {
    // Controleer of koppeling al bestaat (ongeacht status)
    const { data: bestaand } = await supabase
      .from('kamp_lesgevers')
      .select('id, status')
      .eq('kamp_id', kampID)
      .eq('lesgever_id', lesgeverID)
      .maybeSingle();

    if (bestaand) {
      if (bestaand.status === 'bevestigd') {
        toonToast('Lesgever is al bevestigd voor dit kamp.', 'fout');
        return false;
      }
      if (bestaand.status === 'gevraagd' && !direct) {
        toonToast('Uitnodiging werd al verstuurd en wacht op antwoord.', 'fout');
        return false;
      }
      // Bestaande rij bijwerken (her-uitnodigen, of upgrade van 'gevraagd' naar 'bevestigd')
      const update = {
        status:           nieuweStatus,
        gevraagd_op:      new Date().toISOString(),
        beantwoord_op:    direct ? new Date().toISOString() : null,
        weigeringsreden:  null,
        annuleringsreden: null,
      };
      const { error } = await supabase
        .from('kamp_lesgevers').update(update).eq('id', bestaand.id);
      if (error) throw error;

      await stuurKoppelingNotificatie(lesgeverID, kampNaam, direct);
      toonToast(
        direct ? `${kampNaam}: lesgever direct toegevoegd.` : 'Uitnodiging opnieuw verstuurd.',
        'succes'
      );
      return true;
    }

    // Nieuwe koppeling
    const { error } = await supabase
      .from('kamp_lesgevers')
      .insert({
        kamp_id:       kampID,
        lesgever_id:   lesgeverID,
        status:        nieuweStatus,
        gevraagd_op:   new Date().toISOString(),
        beantwoord_op: direct ? new Date().toISOString() : null,
      });
    if (error) throw error;

    // Koppeling op database is gelukt — vanaf hier zijn fouten niet-blokkerend
    await stuurKoppelingNotificatie(lesgeverID, kampNaam, direct).catch(e =>
      console.warn('[admin] Notificatie sturen mislukt:', e?.message));

    // Automatisch contract aanmaken als status meteen 'bevestigd' is
    if (direct) {
      try {
        const { genereerContractAutomatisch } = await import('./contracten.js?v=1780304789425');
        const contract = await genereerContractAutomatisch(lesgeverID, kampID);
        if (contract) {
          toonToast(`Lesgever gekoppeld aan "${kampNaam}". Contract automatisch aangemaakt.`, 'succes');
        } else {
          toonToast(`Lesgever gekoppeld aan "${kampNaam}". Contract kon niet automatisch worden aangemaakt — maak handmatig aan.`, 'info');
        }
      } catch (e) {
        console.warn('[admin] Auto-contract aanmaken mislukt:', e?.message);
        toonToast(`Lesgever gekoppeld aan "${kampNaam}". Contract moet handmatig worden aangemaakt.`, 'info');
      }
    } else {
      toonToast('Uitnodiging verstuurd naar lesgever.', 'succes');
    }
    return true;
  } catch (fout) {
    console.error('[admin] Fout bij koppelen lesgever:', fout?.message ?? fout);
    // Toon de echte foutmelding ipv generieke tekst
    const detail = fout?.message ?? fout?.details ?? 'Onbekende fout';
    toonToast(`Kon ${direct ? 'lesgever niet koppelen' : 'uitnodiging niet versturen'}: ${detail}`, 'fout');
    return false;
  }
}

/**
 * Intern: stuur portaal- én e-mailnotificatie bij koppeling.
 * @param {string} lesgeverID
 * @param {string} kampNaam
 * @param {boolean} direct - Of het een directe koppeling is (geen aanvaard/weiger-flow).
 */
async function stuurKoppelingNotificatie(lesgeverID, kampNaam, direct = false) {
  const bericht = direct
    ? `Je bent ingepland voor kamp "${kampNaam}". Bekijk de planning voor meer info.`
    : `Je bent uitgenodigd voor kamp "${kampNaam}". Aanvaarden of weigeren via je planning.`;

  await maakNotificatie(lesgeverID, 'ingepland', bericht, 'planner.html');

  try {
    const { supabase: sb } = await import('./supabase.js?v=1780304789425');
    await sb.functions.invoke('stuur-email-notificatie', {
      body: { type: direct ? 'koppeling_direct' : 'uitnodiging', lesgeverID, kampNaam },
    });
  } catch { /* Edge Function optioneel */ }
}

/**
 * Verwijder een lesgever-koppeling van een kamp.
 *
 * @param {string} kampID - UUID van het kamp.
 * @param {string} lesgeverID - UUID van de lesgever.
 * @returns {Promise<boolean>}
 */
export async function ontkoppelLesgever(kampID, lesgeverID) {
  try {
    const { error } = await supabase
      .from('kamp_lesgevers')
      .delete()
      .eq('kamp_id', kampID)
      .eq('lesgever_id', lesgeverID);

    if (error) throw error;
    toonToast('Lesgever ontkoppeld.', 'succes');
    return true;
  } catch (fout) {
    toonToast('Kon lesgever niet ontkoppelen.', 'fout');
    return false;
  }
}

// ── Lesgeversbeheer ─────────────────────────────────────────────────

/**
 * Haal alle gebruikersprofielen op.
 *
 * @param {boolean} inclusiefInactief - Of inactieve accounts ook opgehaald worden.
 * @returns {Promise<object[]>} Lijst van profielen.
 */
export async function haalAlleGebruikersOp(inclusiefInactief = false) {
  try {
    let query = supabase
      .from('profielen')
      .select('*')
      .order('achternaam');

    if (!inclusiefInactief) {
      query = query.eq('actief', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  } catch (fout) {
    console.error('[admin] Fout bij ophalen gebruikers:', fout.message);
    return [];
  }
}

/**
 * Werk de rol van een gebruiker bij.
 *
 * @param {string} gebruikerId - UUID van de gebruiker.
 * @param {string} nieuweRol - De nieuwe rol.
 * @returns {Promise<boolean>}
 */
export async function werkRolBij(gebruikerId, nieuweRol) {
  try {
    const { error } = await supabase
      .from('profielen')
      .update({ rol: nieuweRol })
      .eq('id', gebruikerId);
    if (error) throw error;
    toonToast('Rol bijgewerkt.', 'succes');
    return true;
  } catch (fout) {
    toonToast('Kon rol niet bijwerken.', 'fout');
    return false;
  }
}

/**
 * Deactiveer of activeer een gebruikersaccount.
 *
 * @param {string} gebruikerId - UUID van de gebruiker.
 * @param {boolean} actief - Of het account actief moet zijn.
 * @returns {Promise<boolean>}
 */
export async function werkActiefStatusBij(gebruikerId, actief) {
  try {
    const { error } = await supabase
      .from('profielen')
      .update({ actief })
      .eq('id', gebruikerId);
    if (error) throw error;
    toonToast(actief ? 'Account geactiveerd.' : 'Account gedeactiveerd.', 'succes');
    return true;
  } catch (fout) {
    toonToast('Kon account status niet wijzigen.', 'fout');
    return false;
  }
}

// ── Uitnodigingen ───────────────────────────────────────────────────

/**
 * Stuur een uitnodiging aan een nieuw teamlid.
 * Genereert een unieke token en slaat de uitnodiging op.
 *
 * @param {string} email - E-mailadres van de uitgenodigde.
 * @param {string} rol - De rol van de uitgenodigde.
 * @param {string} uitgenodigd_door - UUID van de uitnodigende beheerder.
 * @returns {Promise<string|null>} De uitnodigingslink of null bij fout.
 */
export async function stuurUitnodiging(email, rol, uitgenodigd_door) {
  try {
    const token = genereerToken();

    const { error } = await supabase.from('uitnodigingen').insert({
      email,
      rol,
      token,
      uitgenodigd_door,
    });

    if (error) throw error;

    const link = `${window.location.origin}/registreer.html?token=${token}`;
    toonToast('Uitnodiging aangemaakt.', 'succes');
    return link;
  } catch (fout) {
    console.error('[admin] Fout bij aanmaken uitnodiging:', fout.message);
    toonToast('Kon uitnodiging niet aanmaken: ' + fout.message, 'fout');
    return null;
  }
}

/**
 * Haal alle uitnodigingen op.
 *
 * @returns {Promise<object[]>} Lijst van uitnodigingen.
 */
export async function haalUitnodigingenOp() {
  try {
    const { data, error } = await supabase
      .from('uitnodigingen')
      .select(`
        *,
        uitgenodigd_door_profiel:profielen!uitgenodigd_door (voornaam, achternaam)
      `)
      .order('aangemaakt_op', { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch {
    return [];
  }
}

/**
 * Haal ALLE dagprogramma's met fiches op in één query.
 * Gebruik dit ipv 42 losse calls per kamp — veel sneller.
 *
 * @returns {Promise<Map<string, object[]>>} Map van kampID → dagprogramma-array.
 */
export async function haalAlleDagprogrammasOp() {
  try {
    const { data, error } = await supabase
      .from('dagprogrammas')
      .select(`
        id, kamp_id, datum,
        dagprogramma_fiches (
          id, volgorde, tijdstip, notitie,
          activiteiten_fiches (
            id, naam, categorie, duur_minuten, locatie, moeilijkheid, leeftijdsgroep
          )
        )
      `)
      .order('datum');
    if (error) throw error;

    // Groepeer per kamp_id en verwerk fiches
    const map = new Map();
    for (const dag of (data ?? [])) {
      if (!map.has(dag.kamp_id)) map.set(dag.kamp_id, []);
      map.get(dag.kamp_id).push({
        ...dag,
        fiches: (dag.dagprogramma_fiches ?? [])
          .sort((a, b) => a.volgorde - b.volgorde)
          .map(df => ({ ...df.activiteiten_fiches, ...df })),
      });
    }
    return map;
  } catch (fout) {
    console.error('[admin] Fout bij ophalen alle dagprogrammas:', fout.message);
    return new Map();
  }
}

// ── Beschikbaarheid openzetten ───────────────────────────────────────

/**
 * Zet de beschikbaarheidsregistratie voor een kamp open of dicht.
 * Lesgevers zien het kamp enkel als beschikbaarheid_open = true.
 *
 * @param {string} kampID
 * @param {boolean} open
 * @returns {Promise<boolean>}
 */
export async function zetBeschikbaarheidOpen(kampID, open) {
  try {
    const { error } = await supabase
      .from('kampen')
      .update({ beschikbaarheid_open: open })
      .eq('id', kampID);
    if (error) throw error;
    toonToast(open ? 'Beschikbaarheid opengesteld.' : 'Beschikbaarheid gesloten.', 'succes');
    return true;
  } catch (fout) {
    toonToast('Kon beschikbaarheidsstatus niet wijzigen.', 'fout');
    return false;
  }
}

/**
 * Haal alle beschikbaarheden op voor aankomende kampen, gegroepeerd als matrix.
 * Geeft kampen, actieve lesgevers en al hun ingediende beschikbaarheden terug.
 *
 * @returns {Promise<{kampen: object[], lesgevers: object[], beschikbaarheden: object[]}>}
 */
export async function haalBeschikbaarhedenMatrixOp() {
  const vandaag = lokaleISO(new Date());
  try {
    const [{ data: kampen }, { data: lesgevers }, { data: beschikbaarheden }] = await Promise.all([
      supabase.from('kampen')
        .select('id, naam, startdatum, einddatum')
        .neq('status', 'afgelopen')
        .gte('einddatum', vandaag)
        .order('startdatum'),
      supabase.from('profielen')
        .select('id, voornaam, achternaam, rol')
        .in('rol', ['lesgever', 'extra_hulp'])
        .eq('actief', true)
        .order('achternaam'),
      supabase.from('beschikbaarheden')
        .select('lesgever_id, kamp_id, beschikbaar, onbeschikbare_dagen'),
    ]);
    return {
      kampen:         kampen ?? [],
      lesgevers:      lesgevers ?? [],
      beschikbaarheden: beschikbaarheden ?? [],
    };
  } catch (fout) {
    console.error('[admin] haalBeschikbaarhedenMatrixOp:', fout.message);
    return { kampen: [], lesgevers: [], beschikbaarheden: [] };
  }
}

/**
 * Haal alle ingediende beschikbaarheden op voor een kamp,
 * inclusief profielinfo van de lesgever.
 *
 * @param {string} kampID
 * @returns {Promise<object[]>}
 */
export async function haalBeschikbaarhedenOverzichtOp(kampID) {
  try {
    const { data, error } = await supabase
      .from('beschikbaarheden')
      .select(`
        *,
        profielen!lesgever_id (id, voornaam, achternaam, email, rol, telefoon)
      `)
      .eq('kamp_id', kampID);
    if (error) throw error;
    return data ?? [];
  } catch (fout) {
    console.error('[admin] Fout bij ophalen beschikbaarheden overzicht:', fout.message);
    return [];
  }
}

/**
 * Haal alle koppelingen op voor een kamp met status + profielinfo.
 *
 * @param {string} kampID
 * @returns {Promise<object[]>}
 */
export async function haalKoppelingenOverzichtOp(kampID) {
  try {
    const { data, error } = await supabase
      .from('kamp_lesgevers')
      .select(`
        id, status, weigeringsreden, annuleringsreden,
        gevraagd_op, beantwoord_op,
        profielen!lesgever_id (id, voornaam, achternaam, email, rol, telefoon)
      `)
      .eq('kamp_id', kampID)
      .order('gevraagd_op');
    if (error) throw error;
    return data ?? [];
  } catch (fout) {
    console.error('[admin] Fout bij ophalen koppelingen overzicht:', fout.message);
    return [];
  }
}

// ── Account aanmaken (direct) ────────────────────────────────────────

/**
 * Maak een nieuw account aan voor een lesgever of medewerker,
 * zonder de huidige admin-sessie te verstoren.
 *
 * Stappen:
 *  1. Signup via tijdelijke Supabase-instantie
 *  2. Trigger maakt automatisch een profiel aan
 *  3. Profiel bijwerken met voornaam, achternaam, telefoon en rol
 *  4. Notificatie sturen indien gewenst
 *
 * @param {object} gegevens - Alle accountgegevens.
 * @param {string} gegevens.voornaam
 * @param {string} gegevens.achternaam
 * @param {string} gegevens.email
 * @param {string} gegevens.wachtwoord - Minimaal 8 tekens.
 * @param {string} gegevens.rol - 'lesgever' | 'extra_hulp' | 'coordinator' | 'admin'
 * @param {string} [gegevens.telefoon]
 * @param {string} aangemaakt_door - UUID van de beheerder die het account aanmaakt.
 * @returns {Promise<{succes: boolean, fout: string|null}>}
 */
export async function maakNieuwGebruikerAan(gegevens, aangemaakt_door) {
  const { voornaam, achternaam, email, wachtwoord, rol, telefoon } = gegevens;

  try {
    // Stap 1: auth-account aanmaken via tijdelijke client
    const { gebruiker, fout: authFout } = await maakGebruikerViaSignup(
      email, wachtwoord,
      { voornaam, achternaam, rol }
    );

    if (authFout) {
      // Vertaal veelvoorkomende Supabase-fouten naar Nederlands
      let boodschap = authFout;
      if (authFout.includes('already registered') || authFout.includes('already been registered')) {
        boodschap = 'Er bestaat al een account met dit e-mailadres.';
      } else if (authFout.includes('Password should be at least')) {
        boodschap = 'Het wachtwoord moet minimaal 8 tekens bevatten.';
      } else if (authFout.includes('Unable to validate email')) {
        boodschap = 'Ongeldig e-mailadres.';
      }
      return { succes: false, fout: boodschap };
    }

    if (!gebruiker?.id) {
      return { succes: false, fout: 'Account aangemaakt maar geen gebruikers-ID ontvangen. Controleer Supabase Auth.' };
    }

    // Stap 2: profiel bijwerken met volledige gegevens.
    // De trigger kan het profiel al aangemaakt hebben of nog niet — upsert handelt beide gevallen af.
    const { error: profielFout } = await supabase
      .from('profielen')
      .upsert({
        id:              gebruiker.id,
        voornaam,
        achternaam,
        email,
        rol,
        telefoon:        telefoon || null,
        uitgenodigd_door: aangemaakt_door,
        actief:          true,
      }, { onConflict: 'id' });

    if (profielFout) {
      console.warn('[admin] Profiel bijwerken mislukt:', profielFout.message);
      // Niet fataal — account is wel aangemaakt
    }

    // Stap 3: welkomstnotificatie
    await maakNotificatie(
      gebruiker.id,
      'uitnodiging',
      `Welkom bij SportFun! Je account is aangemaakt als ${rolNaamNL(rol)}.`,
      'profiel.html'
    );

    toonToast(`Account aangemaakt voor ${voornaam} ${achternaam}.`, 'succes');
    return { succes: true, fout: null };

  } catch (fout) {
    console.error('[admin] Fout bij aanmaken gebruiker:', fout.message);
    return { succes: false, fout: fout.message ?? 'Onbekende fout.' };
  }
}

/**
 * Hulpfunctie: Nederlandse rolnaam.
 * @param {string} rol
 * @returns {string}
 */
function rolNaamNL(rol) {
  return { admin: 'Beheerder', coordinator: 'Coördinator', lesgever: 'Lesgever', extra_hulp: 'Extra hulp' }[rol] ?? rol;
}

// ── Dagprogramma's ──────────────────────────────────────────────────

/**
 * Maak een dagprogramma aan als het nog niet bestaat.
 *
 * @param {string} kampID - UUID van het kamp.
 * @param {string} datum - ISO datumstring.
 * @param {string} aangemaakt_door - UUID van de aanmaker.
 * @returns {Promise<string|null>} UUID van het dagprogramma of null.
 */
export async function maakOfHaalDagprogrammaOp(kampID, datum, aangemaakt_door) {
  try {
    const { data: bestaand } = await supabase
      .from('dagprogrammas')
      .select('id')
      .eq('kamp_id', kampID)
      .eq('datum', datum)
      .maybeSingle();

    if (bestaand) return bestaand.id;

    const { data, error } = await supabase
      .from('dagprogrammas')
      .insert({ kamp_id: kampID, datum, aangemaakt_door })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  } catch (fout) {
    console.error('[admin] Fout bij aanmaken dagprogramma:', fout.message);
    return null;
  }
}

/**
 * Voeg een fiche toe aan een dagprogramma.
 *
 * @param {string} dagprogrammaID - UUID van het dagprogramma.
 * @param {string} ficheID - UUID van de fiche.
 * @param {number} volgorde - Positie in het dagprogramma.
 * @param {string|null} tijdstip - Optioneel tijdstip (HH:MM:SS).
 * @param {string|null} notitie - Optionele notitie.
 * @returns {Promise<boolean>}
 */
export async function voegFicheToeAanDag(dagprogrammaID, ficheID, volgorde, tijdstip = null, notitie = null) {
  try {
    const { error } = await supabase.from('dagprogramma_fiches').insert({
      dagprogramma_id: dagprogrammaID,
      fiche_id: ficheID,
      volgorde,
      tijdstip,
      notitie,
    });
    if (error) throw error;
    return true;
  } catch (fout) {
    console.error('[admin] Fout bij toevoegen fiche aan dag:', fout.message);
    toonToast('Kon fiche niet toevoegen.', 'fout');
    return false;
  }
}

/**
 * Verwijder een fiche uit een dagprogramma.
 *
 * @param {string} dagprogrammaFicheID - UUID van de dagprogramma-fiche koppeling.
 * @returns {Promise<boolean>}
 */
export async function verwijderFicheUitDag(dagprogrammaFicheID) {
  try {
    const { error } = await supabase
      .from('dagprogramma_fiches')
      .delete()
      .eq('id', dagprogrammaFicheID);
    if (error) throw error;
    return true;
  } catch {
    toonToast('Kon fiche niet verwijderen.', 'fout');
    return false;
  }
}

/**
 * Werk de volgorde van fiches in een dagprogramma bij.
 *
 * @param {Array<{id: string, volgorde: number}>} updates - Array van update-objecten.
 */
export async function werkVolgordesBij(updates) {
  try {
    await Promise.all(updates.map(u =>
      supabase.from('dagprogramma_fiches')
        .update({ volgorde: u.volgorde })
        .eq('id', u.id)
    ));
  } catch (fout) {
    console.error('[admin] Fout bij bijwerken volgordes:', fout.message);
  }
}

// ── Contract genereren (admin) ──────────────────────────────────────

/**
 * Genereer en sla een contract op voor een lesgever bij een kamp.
 *
 * @param {string} lesgeverID - UUID van de lesgever.
 * @param {string} kampID - UUID van het kamp.
 * @returns {Promise<boolean>}
 */
export async function genereerContractVoorLesgever(lesgeverID, kampID) {
  try {
    // Haal lesgever en kamp op
    const [lesgeverRes, kampRes] = await Promise.all([
      supabase.from('profielen').select('*').eq('id', lesgeverID).single(),
      supabase.from('kampen').select('*').eq('id', kampID).single(),
    ]);

    if (lesgeverRes.error) throw lesgeverRes.error;
    if (kampRes.error) throw kampRes.error;

    const tekst = genereerContractTekst(lesgeverRes.data, kampRes.data);
    const resultaat = await slaContractOp(lesgeverID, kampID, tekst);
    return !!resultaat;
  } catch (fout) {
    console.error('[admin] Fout bij genereren contract:', fout.message);
    toonToast('Kon contract niet genereren.', 'fout');
    return false;
  }
}

// ── Kamp kopiëren ───────────────────────────────────────────────────

/**
 * Kopieer een bestaand kamp als nieuw concept.
 * Neemt alle inhoudelijke velden over (locatie, leeftijdsgroep, …) maar
 * wist de datums zodat de beheerder ze bewust invult, en reset de status
 * naar 'concept'. Geen lesgevers of dagprogramma's worden meegekopieerd.
 *
 * @param {string} kampID - UUID van het te kopiëren kamp.
 * @returns {Promise<object|null>} Het nieuwe kamp of null bij fout.
 */
export async function kopieerKamp(kampID) {
  try {
    const { data: kamp, error } = await supabase
      .from('kampen')
      .select('naam, locatie, adres, leeftijdsgroep')
      .eq('id', kampID)
      .single();

    if (error) throw error;

    const { data: nieuwKamp, error: insertFout } = await supabase
      .from('kampen')
      .insert({
        naam:              `${kamp.naam} (kopie)`,
        locatie:           kamp.locatie,
        adres:             kamp.adres ?? null,
        leeftijdsgroep:    kamp.leeftijdsgroep,
        startdatum:        null,
        einddatum:         null,
        status:            'concept',
        beschikbaarheid_open: false,
        verantwoordelijke: null,
      })
      .select()
      .single();

    if (insertFout) throw insertFout;
    return nieuwKamp;
  } catch (fout) {
    console.error('[admin] Kamp kopiëren mislukt:', fout?.message);
    toonToast('Kon kamp niet kopiëren.', 'fout');
    return null;
  }
}

// ── Renderhulpen ────────────────────────────────────────────────────

/**
 * Render een tabelrij voor een lesgever in de beheerlijst.
 *
 * @param {object} gebruiker - Profielobject.
 * @returns {string} HTML-string voor de tabelrij.
 */
export function renderGebruikerRij(gebruiker) {
  const rolKleur = {
    admin: 'badge-donker', coordinator: 'badge-groen',
    lesgever: 'badge-limoen', extra_hulp: 'badge-zand'
  }[gebruiker.rol] ?? 'badge-grijs';
  const rolNaam = { admin: 'Beheerder', coordinator: 'Coördinator', lesgever: 'Lesgever', extra_hulp: 'Extra hulp' }[gebruiker.rol] ?? gebruiker.rol;

  // JSON.stringify escapet alle speciale tekens voor gebruik in onclick-attributen
  return `
    <tr data-id="${ontsnap(gebruiker.id)}">
      <td>
        <div class="vet">${ontsnap(gebruiker.voornaam)} ${ontsnap(gebruiker.achternaam)}</div>
        <div class="font-klein kleur-grijs">${ontsnap(gebruiker.email)}</div>
      </td>
      <td><span class="badge ${rolKleur}">${ontsnap(rolNaam)}</span></td>
      <td>${ontsnap(gebruiker.telefoon ?? '—')}</td>
      <td>
        <span class="badge ${gebruiker.actief ? 'badge-goedgekeurd' : 'badge-grijs'}">
          ${gebruiker.actief ? 'Actief' : 'Inactief'}
        </span>
      </td>
      <td>
        <div class="flex-gap">
          <button class="knop knop-omtrek knop-klein"
                  onclick="window._wijzigRol(${JSON.stringify(gebruiker.id)},${JSON.stringify(gebruiker.rol)})">Rol</button>
          <button class="knop ${gebruiker.actief ? 'knop-gevaar' : 'knop-middengroen'} knop-klein"
                  onclick="window._toggleActief(${JSON.stringify(gebruiker.id)}, ${!gebruiker.actief})">
            ${gebruiker.actief ? 'Deactiveren' : 'Activeren'}
          </button>
        </div>
      </td>
    </tr>
  `;
}

/**
 * Render een kamp-tabelrij.
 *
 * @param {object} kamp - Kamp-object.
 * @returns {string} HTML-string.
 */
export function renderKampRij(kamp, gekoppelden = []) {
  const statusKleur = { concept: 'badge-concept', actief: 'badge-actief', afgelopen: 'badge-afgelopen' }[kamp.status] ?? 'badge-grijs';
  const verantw = kamp.verantwoordelijke_profiel
    ? `${kamp.verantwoordelijke_profiel.voornaam} ${kamp.verantwoordelijke_profiel.achternaam}`
    : '—';

  // Verantwoordelijke niet herhalen in de pills (staat al in eigen kolom)
  const overige = gekoppelden.filter(lg => lg.id !== kamp.verantwoordelijke);
  const MAX_ZICHTBAAR = 3;
  const zichtbaar = overige.slice(0, MAX_ZICHTBAAR);
  const rest = overige.length - MAX_ZICHTBAAR;
  const lesgeversHTMLVeilig = overige.length === 0
    ? '<span class="font-klein kleur-grijs">—</span>'
    : zichtbaar.map(lg => `<span class="badge badge-grijs" style="font-size:0.7rem">${ontsnap(lg.voornaam)}</span>`).join(' ')
      + (rest > 0 ? ` <span class="font-klein kleur-grijs">+${rest}</span>` : '');

  return `
    <tr data-id="${ontsnap(kamp.id)}">
      <td>
        <div class="vet">${ontsnap(kamp.naam)}</div>
        <div class="font-klein kleur-grijs">${ontsnap(kamp.locatie)}</div>
      </td>
      <td>${ontsnap(datumNaarNL(kamp.startdatum))} – ${ontsnap(datumNaarNL(kamp.einddatum))}</td>
      <td><div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">${lesgeversHTMLVeilig}</div></td>
      <td>${ontsnap(verantw)}</td>
      <td><span class="badge ${statusKleur}">${ontsnap(kamp.status)}</span></td>
      <td>
        <div class="flex-gap">
          <button class="knop knop-primair knop-klein" id="lesgever-knop-${ontsnap(kamp.id)}"
                  onclick="window._toggleKampDetail(${JSON.stringify(kamp.id)})">👥 Lesgevers</button>
          <button class="knop knop-omtrek knop-klein"
                  onclick="window._bewerkKamp(${JSON.stringify(kamp.id)})">Bewerken</button>
          <button class="knop knop-omtrek knop-klein" title="Kopieer dit kamp als nieuw concept"
                  onclick="window._kopieerKamp(${JSON.stringify(kamp.id)})">📋 Kopieer</button>
        </div>
      </td>
    </tr>
    <tr class="kamp-detail-rij verborgen" id="kamp-detail-rij-${ontsnap(kamp.id)}">
      <td colspan="6" style="padding:0;border-top:none">
        <div id="kamp-detail-${ontsnap(kamp.id)}"
             style="padding:20px;background:#f4f2ee;border-left:3px solid var(--kleur-donkergroen);border-bottom:2px solid var(--kleur-donkergroen)">
          <div style="text-align:center;padding:20px;color:var(--kleur-grijs)">
            <div class="laadindicator" style="margin:0 auto 8px"></div>Laden…
          </div>
        </div>
      </td>
    </tr>
  `;
}
