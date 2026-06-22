// Edge Function: admin-reset-password
//
// Doel: een beheerder/coördinator kan het wachtwoord van een gebruiker
// rechtstreeks resetten + e-mail bevestigen, zonder uitnodigingsmail.
//
// Werking:
//   1. Controleert dat de aanroeper ingelogd is en rol 'admin' of 'coordinator' heeft
//   2. Gebruikt de SUPABASE_SERVICE_ROLE_KEY om het wachtwoord bij te werken
//      en email_confirmed_at te zetten
//   3. Veilig: service_role key staat alleen server-side, nooit in de browser
//
// Endpoint: POST {SUPABASE_URL}/functions/v1/admin-reset-password
// Body: { "gebruiker_id": "uuid", "nieuw_wachtwoord": "string" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Toegestane origins — stel SITE_URL in via Supabase Edge Function secrets
const ALLOWED_ORIGINS = new Set([
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

  // Preflight (CORS)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  try {
    // ── 1. Configuratie uit env ──
    const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Edge Function niet correct geconfigureerd" }, 500, origin);
    }

    // ── 2. Authenticatie van de aanroeper ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Geen authorization header" }, 401, origin);
    }

    // Client met de gebruikerstoken om te checken WIE er aanroept
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse({ error: "Ongeldige sessie" }, 401, origin);
    }

    // ── 3. Controleer of de aanroeper admin/coordinator is ──
    // Gebruik service-client om profiel op te halen (omzeilt RLS)
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

    // ── 4. Parse en valideer body ──
    const body = await req.json().catch(() => null);
    if (!body) return jsonResponse({ error: "Ongeldige body" }, 400, origin);

    const { gebruiker_id, nieuw_wachtwoord } = body as {
      gebruiker_id?: string;
      nieuw_wachtwoord?: string;
    };

    if (!gebruiker_id) {
      return jsonResponse({ error: "gebruiker_id ontbreekt" }, 400, origin);
    }
    if (!nieuw_wachtwoord || nieuw_wachtwoord.length < 8) {
      return jsonResponse({ error: "Wachtwoord moet minimaal 8 tekens bevatten" }, 400, origin);
    }

    // ── 5. Reset wachtwoord + bevestig e-mail ──
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(
      gebruiker_id,
      {
        password: nieuw_wachtwoord,
        email_confirm: true,
      }
    );

    if (updateErr) {
      console.error("[admin-reset-password] updateUserById fout:", updateErr);
      return jsonResponse({ error: updateErr.message }, 500, origin);
    }

    return jsonResponse({
      succes: true,
      bericht: "Wachtwoord ingesteld en e-mail bevestigd",
    }, 200, origin);

  } catch (err) {
    console.error("[admin-reset-password] Onverwachte fout:", err);
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
