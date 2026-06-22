/**
 * auth.js — Login, logout en sessiebeheer
 *
 * Beheert authenticatie via Supabase Auth.
 * Elke pagina (behalve index.html) roept checkSessie() aan bij het laden.
 *
 * @module auth
 */

import { supabase } from './supabase.js?v=1780304789425';
import { ontsnap } from './utils.js?v=1780304789425';

// ── Logout altijd beschikbaar ───────────────────────────────────────
// Koppelt de uitlogknop zodra het DOM klaar is — defensief verpakt
// zodat een fout hier nooit de rest van de module breekt.
try {
  if (typeof document !== 'undefined') {
    const koppelLogout = () => {
      const knop = document.getElementById('nav-uitloggen');
      if (knop && !knop.dataset.logoutGekoppeld) {
        knop.dataset.logoutGekoppeld = '1';
        knop.addEventListener('click', () => uitloggen());
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', koppelLogout);
    } else {
      koppelLogout();
    }
  }
} catch (e) {
  console.warn('[auth] Logout-knop koppeling overgeslagen:', e?.message);
}

// ── Sessie & gebruiker ──────────────────────────────────────────────

/**
 * Controleer of er een actieve sessie is.
 * Stuurt niet-ingelogde gebruikers door naar de loginpagina.
 *
 * @returns {Promise<object|null>} De gebruiker of null als er geen sessie is.
 */
export async function checkSessie() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    window.location.href = 'index.html';
    return null;
  }
  return session.user;
}

/**
 * Haal het profiel op van de ingelogde gebruiker (inclusief rol).
 *
 * @param {string} gebruikerId - Het UUID van de gebruiker.
 * @returns {Promise<object|null>} Het profiel-object of null bij fout.
 */
export async function haalProfielOp(gebruikerId) {
  try {
    const { data, error } = await supabase
      .from('profielen')
      .select('*')
      .eq('id', gebruikerId)
      .single();
    if (error) throw error;
    return data;
  } catch (fout) {
    console.error('[auth] Fout bij ophalen profiel:', fout.message);
    return null;
  }
}

/**
 * Haal de rol op van de ingelogde gebruiker.
 *
 * @param {string} gebruikerId - Het UUID van de gebruiker.
 * @returns {Promise<string|null>} De rol ('admin','coordinator','lesgever','extra_hulp') of null.
 */
export async function haalRolOp(gebruikerId) {
  const profiel = await haalProfielOp(gebruikerId);
  return profiel?.rol ?? null;
}

/**
 * Stuur de gebruiker door naar de juiste pagina op basis van zijn/haar rol.
 *
 * @param {string} rol - De rol van de gebruiker.
 */
export function stuurDoorOpRol(rol) {
  window.location.href = 'dashboard.html';
}

// ── Login / Logout ──────────────────────────────────────────────────

/**
 * Log de gebruiker in met e-mail en wachtwoord.
 *
 * @param {string} email - Het e-mailadres van de gebruiker.
 * @param {string} wachtwoord - Het wachtwoord van de gebruiker.
 * @returns {Promise<{gebruiker: object|null, fout: string|null}>}
 */
export async function login(email, wachtwoord) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: wachtwoord,
    });
    if (error) throw error;
    return { gebruiker: data.user, fout: null };
  } catch (fout) {
    let boodschap = 'Aanmelden mislukt. Controleer je e-mail en wachtwoord.';
    if (fout.message?.includes('Invalid login credentials')) {
      boodschap = 'Ongeldig e-mailadres of wachtwoord.';
    } else if (fout.message?.includes('Email not confirmed')) {
      boodschap = 'Bevestig eerst je e-mailadres via de ontvangen e-mail.';
    }
    return { gebruiker: null, fout: boodschap };
  }
}

/**
 * Stuur een wachtwoordreset-e-mail via Supabase.
 *
 * @param {string} email - Het e-mailadres waarnaar de resetlink gestuurd wordt.
 * @returns {Promise<{succes: boolean, fout: string|null}>}
 */
export async function stuurWachtwoordReset(email) {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/index.html',
    });
    if (error) throw error;
    return { succes: true, fout: null };
  } catch (fout) {
    return { succes: false, fout: 'Kon geen reset-e-mail sturen. Probeer opnieuw.' };
  }
}

/**
 * Log de huidige gebruiker uit en stuur door naar de loginpagina.
 */
export async function uitloggen() {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}

// ── Navigatie helpers ───────────────────────────────────────────────

/**
 * Vul de navigatiebalk in met de naam en rol van de gebruiker.
 * Verwacht elementen met id 'nav-naam', 'nav-rol', 'nav-avatar' en 'nav-uitloggen'.
 *
 * @param {object} profiel - Het profiel-object van de gebruiker.
 */
export function vulNavigatieIn(profiel) {
  const naamEl   = document.getElementById('nav-naam');
  const rolEl    = document.getElementById('nav-rol');
  const avatarEl = document.getElementById('nav-avatar');

  if (naamEl)   naamEl.textContent   = `${profiel.voornaam} ${profiel.achternaam}`;
  if (rolEl)    rolEl.textContent    = rolLabel(profiel.rol);
  if (avatarEl) avatarEl.textContent = initialen(profiel.voornaam, profiel.achternaam);

  // Verberg admin-links voor lesgevers/extra hulp
  if (profiel.rol === 'lesgever' || profiel.rol === 'extra_hulp') {
    document.querySelectorAll('.enkel-admin').forEach(el => el.remove());
  }
  // Verberg niet-admin links (bv. Beschikbaarheid) voor beheerders
  if (profiel.rol === 'admin') {
    document.querySelectorAll('.verberg-admin').forEach(el => el.remove());
  }

  const uitlogKnop = document.getElementById('nav-uitloggen');
  if (uitlogKnop) uitlogKnop.addEventListener('click', uitloggen);
}

/**
 * Controleer of de gebruiker een beheerdersrol heeft.
 * Stuurt gewone lesgevers door als ze geen toegang hebben.
 *
 * @param {string} rol - De rol van de gebruiker.
 * @param {string[]} toegestaan - Lijst van toegestane rollen.
 * @returns {boolean}
 */
export function controleerToegang(rol, toegestaan = ['admin', 'coordinator']) {
  if (!toegestaan.includes(rol)) {
    window.location.href = 'planner.html';
    return false;
  }
  return true;
}

// ── Uitnodigingsbeheer ──────────────────────────────────────────────

/**
 * Valideer een uitnodigingstoken en geef de bijbehorende uitnodiging terug.
 *
 * @param {string} token - Het unieke uitnodigingstoken.
 * @returns {Promise<object|null>} De uitnodiging of null als ongeldig/vervallen.
 */
export async function valideerUitnodiging(token) {
  try {
    // Gebruik een SECURITY DEFINER RPC zodat de volledige uitnodigingentabel
    // niet publiek leesbaar hoeft te zijn (zie migratie-veiligheid.sql).
    const { data, error } = await supabase.rpc('publiek_valideer_uitnodiging', { p_token: token });
    if (error || !data?.length) return null;
    return data[0];
  } catch {
    return null;
  }
}

// ── Notificaties ────────────────────────────────────────────────────

/**
 * Haal ongelezen notificaties op voor de ingelogde gebruiker.
 *
 * @param {string} gebruikerId - Het UUID van de gebruiker.
 * @returns {Promise<object[]>} Lijst van notificaties.
 */
export async function haalNotificatiesOp(gebruikerId) {
  try {
    const { data, error } = await supabase
      .from('notificaties')
      .select('*')
      .eq('gebruiker_id', gebruikerId)
      .order('aangemaakt_op', { ascending: false })
      .limit(20);
    if (error) throw error;
    return data ?? [];
  } catch (fout) {
    console.error('[auth] Fout bij ophalen notificaties:', fout.message);
    return [];
  }
}

/**
 * Markeer een notificatie als gelezen.
 *
 * @param {string} notificatieId - Het UUID van de notificatie.
 */
export async function markeerAlsGelezen(notificatieId) {
  await supabase
    .from('notificaties')
    .update({ gelezen: true })
    .eq('id', notificatieId);
}

/**
 * Markeer alle notificaties van een gebruiker als gelezen.
 *
 * @param {string} gebruikerId - Het UUID van de gebruiker.
 */
export async function markeerAlleGelezen(gebruikerId) {
  await supabase
    .from('notificaties')
    .update({ gelezen: true })
    .eq('gebruiker_id', gebruikerId);
}

/**
 * Maak een nieuwe notificatie aan voor een gebruiker.
 *
 * @param {string} gebruikerId - Ontvanger UUID.
 * @param {string} type - Type notificatie.
 * @param {string} bericht - De tekst van de notificatie.
 * @param {string} [link] - Optionele link waarnaar de notificatie verwijst.
 */
export async function maakNotificatie(gebruikerId, type, bericht, link = null) {
  try {
    await supabase.from('notificaties').insert({
      gebruiker_id: gebruikerId,
      type,
      bericht,
      link,
    });
  } catch (fout) {
    console.error('[auth] Fout bij aanmaken notificatie:', fout.message);
  }
}

/**
 * Toon een badge op het profiel-avatar als er niet-ondertekende contracten zijn.
 * Alleen relevant voor lesgevers/extra_hulp — admins tekenen geen eigen contracten.
 *
 * @param {string} gebruikerId
 */
export async function initialiseerContractBadge(gebruikerId) {
  try {
    const { count, error } = await supabase
      .from('contracten')
      .select('id', { count: 'exact', head: true })
      .eq('lesgever_id', gebruikerId)
      .eq('ondertekend', false);
    if (error || !count) return;
    const avatarEl = document.getElementById('nav-avatar');
    if (!avatarEl) return;
    // Zorg dat de wrapper positie heeft voor absolute positionering badge
    avatarEl.style.position = 'relative';
    const badge = document.createElement('span');
    badge.className = 'nav-contract-badge';
    badge.title = `${count} contract${count > 1 ? 'en' : ''} te ondertekenen`;
    badge.textContent = count;
    avatarEl.appendChild(badge);
  } catch (fout) {
    console.warn('[auth] Contract badge mislukt:', fout.message);
  }
}

/**
 * Initialiseer de notificatiebel in de navigatie.
 * Verwacht elementen: #notif-bel, #notif-badge, #notif-lijst, #notif-alles-gelezen.
 *
 * @param {string} gebruikerId - Het UUID van de gebruiker.
 */
export async function initialiseerNotificatieBel(gebruikerId) {
  const notificaties = await haalNotificatiesOp(gebruikerId);
  const ongelezen = notificaties.filter(n => !n.gelezen);

  const badge  = document.getElementById('notif-badge');
  const lijst  = document.getElementById('notif-lijst');
  const bel    = document.getElementById('notif-bel');
  const alles  = document.getElementById('notif-alles-gelezen');

  if (badge) {
    badge.textContent = ongelezen.length;
    badge.classList.toggle('verborgen', ongelezen.length === 0);
  }

  if (lijst) {
    if (notificaties.length === 0) {
      lijst.innerHTML = '<div class="notificatie-item kleur-grijs tekstmidden font-klein" style="padding:20px">Geen notificaties</div>';
    } else {
      // data-attributen voor ID en link; bericht via textContent (geen XSS)
      lijst.innerHTML = notificaties.map(n => `
        <div class="notificatie-item ${n.gelezen ? '' : 'ongelezen'}"
             data-notif-id="${ontsnap(n.id)}"
             data-notif-link="${ontsnap(n.link ?? '')}">
          <div class="notif-bericht"></div>
          <div class="notif-tijd">${ontsnap(tijdGeleden(n.aangemaakt_op))}</div>
        </div>
      `).join('');

      // Vul berichten via textContent zodat HTML-injectie onmogelijk is
      const items = lijst.querySelectorAll('.notificatie-item[data-notif-id]');
      items.forEach((el, i) => {
        el.querySelector('.notif-bericht').textContent = notificaties[i].bericht ?? '';
      });

      // Klikafhandeling via event delegation (geen inline onclick)
      lijst.addEventListener('click', async (e) => {
        const item = e.target.closest('[data-notif-id]');
        if (!item) return;
        const id   = item.dataset.notifId;
        const link = item.dataset.notifLink;
        await markeerAlsGelezen(id);
        item.classList.remove('ongelezen');
        if (badge && ongelezen.length > 0) {
          const nieuw = Math.max(0, Number(badge.textContent) - 1);
          badge.textContent = nieuw;
          badge.classList.toggle('verborgen', nieuw === 0);
        }
        if (isRelatieveLink(link)) window.location.href = link;
      }, { once: false });
    }
  }

  // Toggle dropdown
  if (bel) {
    const dropdown = document.getElementById('notif-dropdown');
    bel.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown?.classList.toggle('verborgen');
    });
    document.addEventListener('click', () => dropdown?.classList.add('verborgen'));
  }

  if (alles) {
    alles.addEventListener('click', async () => {
      await markeerAlleGelezen(gebruikerId);
      if (badge) { badge.textContent = '0'; badge.classList.add('verborgen'); }
      document.querySelectorAll('.notificatie-item.ongelezen')
        .forEach(el => el.classList.remove('ongelezen'));
    });
  }

}

// ── Hulpfuncties ────────────────────────────────────────────────────

/**
 * Geeft initialen terug op basis van voor- en achternaam.
 * @param {string} voornaam
 * @param {string} achternaam
 * @returns {string} Bv. "JD"
 */
function initialen(voornaam, achternaam) {
  return ((voornaam?.[0] ?? '') + (achternaam?.[0] ?? '')).toUpperCase();
}

/**
 * Geeft een leesbaar label voor een rol.
 * @param {string} rol
 * @returns {string}
 */
export function rolLabel(rol) {
  const labels = {
    admin:      'Beheerder',
    coordinator: 'Coördinator',
    lesgever:   'Lesgever',
    extra_hulp: 'Extra hulp',
  };
  return labels[rol] ?? rol;
}

/**
 * Valideer dat een link relatief is of naar hetzelfde domein wijst.
 * Beschermt tegen open-redirect aanvallen via notificatielinks.
 * @param {string} link
 * @returns {boolean}
 */
function isRelatieveLink(link) {
  if (!link || link === 'null' || link === '') return false;
  try {
    const url = new URL(link, window.location.origin);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Berekent hoe lang geleden een datum was als leesbare string.
 * @param {string} iso - ISO 8601 datumstring.
 * @returns {string} Bv. "2 uur geleden"
 */
function tijdGeleden(iso) {
  const nu = Date.now();
  const dan = new Date(iso).getTime();
  const diff = Math.floor((nu - dan) / 1000);
  if (diff < 60) return 'Zonet';
  if (diff < 3600) return `${Math.floor(diff / 60)} min geleden`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} uur geleden`;
  return `${Math.floor(diff / 86400)} dag(en) geleden`;
}
