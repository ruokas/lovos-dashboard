// Supabase Edge Function karkasas ataskaitų eksportui.
// Naudoja service_role raktą serverio pusėje ir tikrina pateiktą naudotojo JWT.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) {
    return "day,status_updates,occupancy_updates,avg_minutes_between_status_and_occupancy,sla_breaches";
  }

  const headers = Object.keys(rows[0]);
  const escapeValue = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const stringValue = String(value);
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const csvRows = rows.map((row) => headers.map((header) => escapeValue(row[header])).join(","));
  return [headers.join(","), ...csvRows].join("\n");
}

serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: { ...corsHeaders } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase env variables", { supabaseUrl: Boolean(supabaseUrl) });
      return new Response(
        JSON.stringify({ error: "Supabase URL arba SERVICE_ROLE raktas nenustatytas" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
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
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: userData, error: userError } = await supabaseAdminClient.auth.getUser(token);
    if (userError || !userData.user) {
      console.error("JWT validation failed", { error: userError });
      return new Response(JSON.stringify({ error: "Neteisingas arba pasibaigęs JWT" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const role = userData.user.user_metadata?.role ?? null;
    if (!role || !["auditor", "admin"].includes(role)) {
      return new Response(JSON.stringify({ error: "Naudotojas neturi teisės eksportuoti ataskaitos" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const url = new URL(request.url);
    const requestedFormat = url.searchParams.get("format")?.toLowerCase() ?? "json";
    const format = requestedFormat === "csv" ? "csv" : "json";

    const [metricsResult, interactionsResult] = await Promise.all([
      supabaseAdminClient
        .from("daily_bed_metrics")
        .select("day,status_updates,occupancy_updates,avg_minutes_between_status_and_occupancy,sla_breaches")
        .order("day", { ascending: false })
        .limit(30),
      supabaseAdminClient
        .from("user_interactions")
        .select("interaction_type,bed_id,tag_code,performed_by,occurred_at,payload")
        .order("occurred_at", { ascending: false })
        .limit(100),
    ]);

    if (metricsResult.error) {
      console.error("Failed to fetch daily metrics", metricsResult.error);
      throw metricsResult.error;
    }

    if (interactionsResult.error) {
      console.error("Failed to fetch interactions", interactionsResult.error);
      throw interactionsResult.error;
    }

    const metrics = metricsResult.data ?? [];
    const interactions = interactionsResult.data ?? [];

    if (format === "csv") {
      const csv = toCsv(metrics as Record<string, unknown>[]);
      return new Response(csv, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=rslsmps-daily-metrics-${new Date().toISOString()}.csv`,
        },
      });
    }

    const payload: JsonRecord = {
      generatedAt: new Date().toISOString(),
      requestedBy: userData.user.email,
      metrics,
      interactions,
    };

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    console.error("Report export edge function error", err);
    return new Response(JSON.stringify({ error: "Vidinė serverio klaida" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
