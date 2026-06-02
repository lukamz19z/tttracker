import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./supabase-config";

export function createSupabaseBrowser() {
  return createBrowserClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
  );
}
