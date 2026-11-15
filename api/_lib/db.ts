import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";

let client: SupabaseClient | null = null;

/** Server-only Supabase client (service role key never reaches the browser). */
export function db(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export function notConfigured(res: VercelResponse) {
  res.status(503).json({ error: "not_configured", message: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY" });
}

export function fail(res: VercelResponse, e: unknown) {
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
  res.status(500).json({ error: "server_error", message: msg });
}
