// Supabase Edge Function karkasas ataskaitų eksportui.
// Naudoja service_role raktą serverio pusėje ir tikrina pateiktą naudotojo JWT.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

serve(async (request: Request): Promise<Response> => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase env variables", { supabaseUrl: Boolean(supabaseUrl) });
      return new Response(
        JSON.stringify({ error: "Supabase URL arba SERVICE_ROLE raktas nenustatytas" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return new Response(JSON.stringify({ error: "Authorization antraštė nerasta" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabaseAdminClient.auth.getUser(token);
    if (error || !data.user) {
      console.error("JWT validation failed", { error });
      return new Response(JSON.stringify({ error: "Neteisingas arba pasibaigęs JWT" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Čia ateityje bus tikrasis eksportavimo scenarijus (CSV, PDF ir pan.).
    const payload: JsonRecord = {
      message: "Ataskaitos eksportas paruoštas, pridėkite verslo logiką.",
      requestedBy: data.user.email,
      requestedAt: new Date().toISOString(),
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Report export edge function error", err);
    return new Response(JSON.stringify({ error: "Vidinė serverio klaida" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
