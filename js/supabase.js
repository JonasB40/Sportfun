/**
 * supabase.js — Supabase client initialisatie
 *
 * Initialiseer de Supabase client met de project-URL en anonieme sleutel.
 * Vul SUPABASE_URL en SUPABASE_ANON_KEY in met de waarden van jouw Supabase project
 * (te vinden in het Supabase dashboard onder Project Settings > API).
 *
 * @module supabase
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ── Vervang deze waarden met jouw eigen Supabase projectgegevens ──
const SUPABASE_URL = 'https://coiocqvopxgvdezuwqou.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvaW9jcXZvcHhndmRlenV3cW91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzU2OTcsImV4cCI6MjA5NTgxMTY5N30.q_c8US8ifQEeOITc7_5N8oGFHhl6Yf7YCcZSyByEHWg';

// Supabase project: coiocqvopxgvdezuwqou

/**
 * De gedeelde Supabase client instantie.
 * Importeer deze in alle andere modules via:
 *   import { supabase } from './supabase.js?v=1780304789425';
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Lazy singleton voor de tijdelijke signup-client.
 * Slechts één extra GoTrueClient instantie — voorkomt de
 * "Multiple GoTrueClient instances" console-waarschuwing.
 *
 * De eigen storageKey ('sportfun-admin-signup') zorgt dat deze client
 * nooit botst met de hoofd-client (die de standaard sleutel gebruikt).
 */
let _signupClient = null;
function getSignupClient() {
  if (!_signupClient) {
    _signupClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storageKey: 'sportfun-admin-signup', // Eigen sleutel = geen conflict
      },
    });
  }
  return _signupClient;
}

/**
 * Maak een nieuw gebruikersaccount aan zonder de huidige sessie te verstoren.
 * Hergebruikt één vaste tijdelijke client (lazy singleton) zodat er nooit
 * meer dan twee GoTrueClient instanties tegelijk actief zijn.
 *
 * @param {string} email - E-mailadres van de nieuwe gebruiker.
 * @param {string} wachtwoord - Wachtwoord (min. 8 tekens).
 * @param {object} metadata - Extra gegevens: { voornaam, achternaam, rol }.
 * @returns {Promise<{gebruiker: object|null, fout: string|null}>}
 */
export async function maakGebruikerViaSignup(email, wachtwoord, metadata) {
  const { data, error } = await getSignupClient().auth.signUp({
    email,
    password: wachtwoord,
    options: { data: metadata },
  });

  if (error) {
    return { gebruiker: null, fout: error.message };
  }

  // Geeft de nieuwe gebruiker terug (met id) zonder de admin-sessie te raken
  return { gebruiker: data.user, fout: null };
}
