import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl } from "./supabase-config";
import { createRequestResilientFetch } from "./backend-resilience";

export async function createSupabaseServer() {
  const cookieStore = await cookies();
  const requestFetch = createRequestResilientFetch();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: { fetch: requestFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies. Proxy refresh handles it.
        }
      },
    },
  });
}
