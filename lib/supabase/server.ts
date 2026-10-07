import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { createSupabaseServerFetch } from "@/lib/supabase/server-fetch";

let client: SupabaseClient | null | undefined;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    client = null;
    return client;
  }

  client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: createSupabaseServerFetch(env.SUPABASE_SECRET_KEY),
      headers: { "X-Client-Info": "vienna-job-tracker/server" },
    },
  });
  return client;
}

export function isSupabaseConfigured() {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY);
}
