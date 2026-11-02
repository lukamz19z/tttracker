import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./supabase-config";
import { resilientFetch } from "./backend-resilience";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createSupabaseBrowser() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    { global: { fetch: resilientFetch } },
  );
  return browserClient;
}
