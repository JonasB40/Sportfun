// Edge Function: admin-create-user
//
// Doel: een beheerder/coördinator maakt een account aan dat DIRECT kan
// inloggen — zonder e-mailbevestiging. Lost het probleem op dat via de
// gewone signup aangemaakte accounts eerst een bevestigingsmail vereisen,
// waardoor lesgevers niet kunnen inloggen en zich dubbel registreren.
//
// Werking:
//   1. Controleert dat de aanroeper ingelogd is en rol 'admin' of 'coordinator' heeft
//   2. Gebruikt de SUPABASE_SERVICE_ROLE_KEY om de gebruiker aan te maken
//      met email_confirm: true (direct bruikbaar account)
//   3. Maakt/werkt het profiel bij zodat het meteen compleet is
//
// Endpoint: POST {SUPABASE_URL}/functions/v1/admin-create-user
// Body: { email, wachtwoord, voornaam, achternaam, rol, telefoon? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Toegestane origins.
//
// De productie-URL staat hier bewust hard in plaats van enkel in de
// SITE_URL-secret. Een niet-ingestelde secret laat CORS stil falen met
// "null" als toegestane origin, en dat is lastig te herkennen vanuit de
// browser. SITE_URL blijft ondersteund voor een eventueel eigen domein.
const ALLOWED_ORIGINS = new Set([
  "https://sportfun.netlify.app",
  "http://localhost:8181",
  "http://localhost:8080",
  Deno.env.get("SITE_URL") ?? "",
].filter(Boolean));

function getCorsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  try {
    const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Edge Function niet correct geconfigureerd" }, 500, origin);
    }

    // ── Authenticatie van de aanroeper ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Geen authorization header" }, 401, origin);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse({ error: "Ongeldige sessie" }, 401, origin);
    }

    // ── Alleen admin/coordinator mag accounts aanmaken ──
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: profiel, error: profErr } = await adminClient
      .from("profielen")
      .select("rol")
      .eq("id", user.id)
      .single();

    if (profErr || !profiel) {
      return jsonResponse({ error: "Profiel niet gevonden" }, 403, origin);
    }
    if (!["admin", "coordinator"].includes(profiel.rol)) {
      return jsonResponse({ error: "Onvoldoende rechten" }, 403, origin);
    }

    // ── Body valideren ──
    const body = await req.json().catch(() => null);
    if (!body) return jsonResponse({ error: "Ongeldige body" }, 400, origin);

    const { email, wachtwoord, voornaam, achternaam, rol, telefoon } = body as {
      email?: string; wachtwoord?: string; voornaam?: string;
      achternaam?: string; rol?: string; telefoon?: string;
    };

    if (!email || !voornaam || !achternaam) {
      return jsonResponse({ error: "email, voornaam en achternaam zijn verplicht" }, 400, origin);
    }
    if (!wachtwoord || wachtwoord.length < 8) {
      return jsonResponse({ error: "Wachtwoord moet minimaal 8 tekens bevatten" }, 400, origin);
    }
    const toegestaneRollen = ["lesgever", "extra_hulp", "coordinator", "admin"];
    const veiligRol = toegestaneRollen.includes(rol ?? "") ? rol! : "lesgever";

    // ── Account aanmaken met bevestigde e-mail ──
    const { data: nieuw, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password: wachtwoord,
      email_confirm: true,
      user_metadata: { voornaam, achternaam, rol: veiligRol },
    });

    if (createErr) {
      // Bestaat het account al? Geef een herkenbare code terug.
      const msg = createErr.message ?? "";
      if (msg.includes("already been registered") || msg.includes("already registered")) {
        return jsonResponse({ error: "bestaat_al", detail: msg }, 409, origin);
      }
      console.error("[admin-create-user] createUser fout:", createErr);
      return jsonResponse({ error: msg }, 500, origin);
    }

    const nieuweID = nieuw.user?.id;
    if (!nieuweID) {
      return jsonResponse({ error: "Account aangemaakt maar geen ID ontvangen" }, 500, origin);
    }

    // ── Profiel compleet maken (trigger kan basisrecord al gemaakt hebben) ──
    const { error: upsertErr } = await adminClient
      .from("profielen")
      .upsert({
        id: nieuweID,
        voornaam,
        achternaam,
        email,
        rol: veiligRol,
        telefoon: telefoon || null,
        uitgenodigd_door: user.id,
        actief: true,
      }, { onConflict: "id" });

    if (upsertErr) {
      console.error("[admin-create-user] profiel upsert fout:", upsertErr);
      // Niet fataal: account bestaat en kan inloggen; profiel-trigger vult basis
    }

    return jsonResponse({
      succes: true,
      gebruiker_id: nieuweID,
      bericht: "Account aangemaakt — direct bruikbaar, geen e-mailbevestiging nodig",
    }, 200, origin);

  } catch (err) {
    console.error("[admin-create-user] Onverwachte fout:", err);
    return jsonResponse({
      error: err instanceof Error ? err.message : "Onbekende fout"
    }, 500, origin);
  }
});

/** Helper: JSON response met CORS-headers */
function jsonResponse(data: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
  });
}
